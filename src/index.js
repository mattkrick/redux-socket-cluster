// For now, socketcluster-client is a devDep because of https://github.com/npm/npm/issues/3081
import socketCluster from 'socketcluster-client';
import React, {Component} from 'react';
import promisify from 'es6-promisify';
import {Map, List} from 'immutable';

// constants
const {CLOSED, CONNECTING, OPEN, AUTHENTICATED, PENDING, UNAUTHENTICATED} = socketCluster.SCSocket;
const CONNECT_REQUEST = '@@socketCluster/CONNECT_REQUEST';
const CONNECT_SUCCESS = '@@socketCluster/CONNECT_SUCCESS';
const CONNECT_ERROR = '@@socketCluster/CONNECT_ERROR';
const AUTH_REQUEST = '@@socketCluster/AUTH_REQUEST';
const AUTH_SUCCESS = '@@socketCluster/AUTH_SUCCESS';
const AUTH_ERROR = '@@socketCluster/AUTH_ERROR';
const SUBSCRIBE_REQUEST = '@@socketCluster/SUBSCRIBE_REQUEST';
const SUBSCRIBE_SUCCESS = '@@socketCluster/SUBSCRIBE_SUCCESS';
const UNSUBSCRIBE = '@@socketCluster/UNSUBSCRIBE';
const SUBSCRIBE_ERROR = '@@socketCluster/SUBSCRIBE_ERROR';
const KICKOUT = '@@socketCluster/KICKOUT';
const DISCONNECT = '@@socketCluster/DISCONNECT';
const DEAUTHENTICATE = '@@socketCluster/DEAUTHENTICATE';

// Reducer
const initialState = Map({
  id: null,
  socketState: CLOSED,
  authState: PENDING,
  authToken: null,
  authError: null,
  error: null,
  pendingSubs: List(),
  subs: List()
});

export const socketClusterReducer = function (state = initialState, action) {
  switch (action.type) {
    case DEAUTHENTICATE:
      return state.merge({
        authState: UNAUTHENTICATED,
        authToken: null
      });
    case DISCONNECT:
      return initialState;
    case CONNECT_REQUEST:
      return state.merge({
        socketState: CONNECTING
      });
    case CONNECT_ERROR:
      return state.merge({
        error: action.error
      });
    case CONNECT_SUCCESS:
      return state.merge({
        id: action.payload.id,
        socketState: action.payload.socketState,
        authState: action.payload.authState,
        error: action.error
      });
    case AUTH_REQUEST:
      return state.merge({
        authState: PENDING
      });
    case AUTH_SUCCESS:
      return state.merge({
        authState: AUTHENTICATED,
        authToken: action.payload.authToken
      });
    case AUTH_ERROR:
      return state.merge({
        authState: UNAUTHENTICATED,
        authError: action.error
      });
    case SUBSCRIBE_REQUEST:
      return state.merge({
        pendingSubs: state.get('pendingSubs').push(action.payload.channelName)
      });
    case SUBSCRIBE_SUCCESS:
      return state.merge({
        pendingSubs: state.get('pendingSubs').filter(sub => sub !== action.payload.channelName),
        subs: state.subs.push(action.payload.channelName)
      });
    case SUBSCRIBE_ERROR:
      return state.merge({
        pendingSubs: state.get('pendingSubs').filter(sub => sub !== action.payload.channelName),
        error: action.error
      });
    case UNSUBSCRIBE:
      return state.merge({
        subs: state.get('subs').filter(sub => sub !== action.payload.channelName),
        error: action.error
      });
    case KICKOUT:
      return state.merge({
        error: action.error
      });
    default:
      return state;
  }
};

// HOC
export const reduxSocket = (options, reduxSCOptions) => ComposedComponent =>
  class SocketClustered extends Component {
    static contextTypes = {
      store: React.PropTypes.object.isRequired
    };

    constructor(props, context) {
      super(props, context);
      options = options || {};
      this.clusteredOptions = Object.assign({
        keepAlive: 5000
      }, reduxSCOptions);
    }

    componentWillMount() {
      this.socket = socketCluster.connect(options);
      this.authTokenName = options.authTokenName;
      if (!this.socket.__destructionCountdown) {
        this.handleConnection();
        this.handleError();
        this.handleSubs();
        this.handleAuth();
        return;
      }
      clearTimeout(this.socket.__destructionCountdown);
    }

    componentWillUnmount() {
      this.socket.__destructionCountdown = setTimeout(() => {
        this.socket.disconnect();
        this.socket = socketCluster.destroy(options);
      }, this.clusteredOptions.keepAlive);
    }

    render() {
      return (
        <ComposedComponent {...this.props}/>
      );
    }

    handleSubs() {
      const {dispatch} = this.context.store;
      const {socket} = this;
      socket.on('subscribeStateChange', (channelName, oldState, newState) => {
        if (newState === PENDING) {
          dispatch({type: SUBSCRIBE_REQUEST, payload: {channelName}});
        }
      });
      socket.on('subscribe', channelName => {
        dispatch({type: SUBSCRIBE_SUCCESS, payload: {channelName}});
      });
      socket.on('subscribeFail', (error, channelName) => {
        dispatch({type: SUBSCRIBE_ERROR, payload: {channelName}, error});
      });
      // only sends a messsage to error, unsub does the rest, takes in (error, channelName)
      socket.on('kickOut', error => {
        dispatch({type: KICKOUT, error});
      });
      socket.on('unsubscribe', channelName => {
        dispatch({type: UNSUBSCRIBE, payload: {channelName}});
      });
    }

    handleConnection() {
      const {dispatch} = this.context.store;
      const {socket} = this;

      // handle case where socket was opened before the HOC
      if (socket.state === OPEN) {
        if (!socket.id || socket.authState !== AUTHENTICATED) {
          dispatch({
            type: CONNECT_SUCCESS,
            payload: {
              id: socket.id,
              authState: socket.authState,
              socketState: socket.state
            }
          })
        }
      } else {
        dispatch({type: CONNECT_REQUEST, payload: {socketState: socket.state}});
      }

      socket.on('connect', status => {
        dispatch({
          type: CONNECT_SUCCESS,
          payload: {
            id: status.id,
            authState: socket.authState,
            socketState: socket.state
          },
          error: status.authError
        });
      });
      socket.on('disconnect', () => {
        dispatch({type: DISCONNECT});
      });
      // triggers while in connecting state
      socket.on('connectAbort', () => {
        dispatch({type: DISCONNECT});
      });
    }

    handleError() {
      const {dispatch} = this.context.store;
      const {socket} = this;
      socket.on('error', error => {
        dispatch({type: CONNECT_ERROR, error: error.message});
      });
    }

    async handleAuth() {
      const {dispatch} = this.context.store;
      const {socket, authTokenName} = this;
      socket.on('authenticate', authToken => {
        dispatch({type: AUTH_SUCCESS, payload: {authToken}});
      });
      socket.on('deauthenticate', () => {
        dispatch({type: DEAUTHENTICATE});
      });
      if (authTokenName && socket.authState !== AUTHENTICATED) {
        dispatch({type: AUTH_REQUEST});
        const loadToken = promisify(socket.auth.loadToken.bind(socket.auth));
        const authenticate = promisify(socket.authenticate.bind(socket));
        const authToken = await loadToken(authTokenName);
        const authStatus = await authenticate(authToken);
        if (authStatus.authError) {
          dispatch({type: AUTH_ERROR, error: authStatus.authError.message});
        }
      }
    }
  };
