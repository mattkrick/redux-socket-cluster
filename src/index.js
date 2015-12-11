import React, { Component } from 'react';
import promisify from 'es6-promisify';
// constants
const CONNECT_REQUEST = '@@socketCluster/CONNECT_REQUEST';
const CONNECT_SUCCESS = '@@socketCluster/CONNECT_SUCCESS';
const CONNECT_ERROR = '@@socketCluster/CONNECT_ERROR';
const AUTH_REQUEST = '@@socketCluster/AUTH_REQUEST';
const AUTH_SUCCESS = '@@socketCluster/AUTH_SUCCESS';
const AUTH_ERROR = '@@socketCluster/AUTH_ERROR';
const SUBSCRIBE_REQUEST = '@@socketCluster/SUBSCRIBE_REQUEST';
const SUBSCRIBE_SUCCESS = '@@socketCluster/SUBSCRIBE_SUCCESS';
const SUBSCRIBE_ERROR = '@@socketCluster/SUBSCRIBE_ERROR';
const KICKOUT = '@@socketCluster/KICKOUT';
const UNSUBSCRIBE = '@@socketCluster/UNSUBSCRIBE';
const DISCONNECT = '@@socketCluster/DISCONNECT';
const DEAUTHENTICATE = '@@socketCluster/DEAUTHENTICATE';

// Reducer
const initialState = {
  state: 'closed',
  id: null,
  isAuthenticated: false,
  isAuthenticating: false,
  lastError: null,
  token: null,
  // connectionError: '', //waiting on v4
  // permissionError: '', //waiting on v4
  // tokenError: '', //waiting on v4
  pendingSubs: [],
  subs: []
};

export const socketClusterReducer = function (state = initialState, action) {
  switch (action.type) {
    case DEAUTHENTICATE:
      return Object.assign({}, state, {
        isAuthenticated: false,
        token: null
      });
    case DISCONNECT:
      return Object.assign({}, initialState);
    case CONNECT_REQUEST:
      return Object.assign({}, state, {
        state: 'connecting'
      });
    case CONNECT_ERROR:
      return Object.assign({}, state, {
        lastError: action.error
      });
    case CONNECT_SUCCESS:
      return Object.assign({}, state, {
        state: action.payload.state,
        id: action.payload.id,
        isAuthenticated: action.payload.isAuthenticated,
        lastError: action.error
      });
    case AUTH_REQUEST:
      return Object.assign({}, state, {
        isAuthenticating: true
      });
    case AUTH_SUCCESS:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: true,
        token: action.payload.token
      });
    case AUTH_ERROR:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: false,
        lastError: action.error
      });
    case SUBSCRIBE_REQUEST:
      return Object.assign({}, state, {
        pendingSubs: [...state.pendingSubs, action.payload.channelName]
      });
    case SUBSCRIBE_SUCCESS:
      return Object.assign({}, state, {
        pendingSubs: state.pendingSubs.filter(sub => sub !== action.payload.channelName),
        subs: [...state.subs, action.payload.channelName]
      });
    case SUBSCRIBE_ERROR:
      return Object.assign({}, state, {
        pendingSubs: state.pendingSubs.filter(sub => sub !== action.payload.channelName),
        lastError: action.error
      });
    case KICKOUT:
      return Object.assign({}, state, {
        lastError: action.error
      });
    case UNSUBSCRIBE:
      return Object.assign({}, state, {
        subs: state.subs.filter(sub => sub !== action.payload.channelName)
      });
    default:
      return state;
  }
};

// HOC
export const reduxSocket = (socket, reduxSCOptions) => ComposedComponent => {
  return class SocketClustered extends Component {
    static contextTypes = {
      store: React.PropTypes.object.isRequired
    };

    constructor(props, context) {
      super(props, context);
      this.clusteredOptions = Object.assign({
        keepAlive: 5000
      }, reduxSCOptions);
    }

    componentWillMount() {
      if (!socket.__destructionCountdown) {
        // if there is a countdown, we know it already exists
        this.handleConnection();
        this.handleError();
        this.handleSubs();
        this.handleAuth();
        return;
      }
      clearTimeout(socket.__destructionCountdown);
    }

    componentWillUnmount() {
      socket.__destructionCountdown = setTimeout(() => {
        socket.disconnect();
        // socket = socketCluster.destroy(options);
      }, this.clusteredOptions.keepAlive);
    }

    render() {
      return (
        <ComposedComponent {...this.props}/>
      );
    }

    handleSubs() {
      const {dispatch} = this.context.store;
      socket.on('subscribeRequest', channelName => {
        dispatch({type: SUBSCRIBE_REQUEST, payload: {channelName}});
      });
      socket.on('subscribe', channelName => {
        dispatch({type: SUBSCRIBE_SUCCESS, payload: {channelName}});
      });
      socket.on('subscribeFail', (error, channelName) => {
        dispatch({type: SUBSCRIBE_ERROR, payload: {channelName}, error});
      });
      // only sends a messsage to lastError, unsub does the rest, event has (error, channelName}
      socket.on('kickOut', error => {
        dispatch({type: KICKOUT, error});
      });
      socket.on('unsubscribe', channelName => {
        dispatch({type: UNSUBSCRIBE, payload: {channelName}});
      });
    }

    handleConnection() {
      const {dispatch} = this.context.store;

      // handle case where socket was opened just before the HOC
      if (socket.state !== 'open') {
        dispatch({type: CONNECT_REQUEST, payload: {state: socket.getState()}});
        dispatch({
          type: CONNECT_SUCCESS,
          payload: {
            id: socket.id,
            isAuthenticated: socket.isAuthenticated,
            state: socket.state
          }
        });
      }
      socket.on('connect', status => {
        dispatch({
          type: CONNECT_SUCCESS,
          payload: {
            id: status.id,
            isAuthenticated: status.isAuthenticated,
            state: 'open'
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
      socket.on('error', error => {
        dispatch({type: CONNECT_ERROR, error: error.message});
      });
    }

    async handleAuth() {
      const {dispatch} = this.context.store;
      const {authTokenName} = socket.options;
      socket.on('authenticate', token => {
        dispatch({type: AUTH_SUCCESS, payload: {token}});
      });
      socket.on('removeAuthToken', () => {
        dispatch({type: DEAUTHENTICATE});
      });
      if (authTokenName && socket.isAuthenticated !== true) {
        dispatch({type: AUTH_REQUEST});
        const loadToken = promisify(socket.auth.loadToken.bind(socket.auth));
        const authenticate = promisify(socket.authenticate.bind(socket));
        const token = await loadToken(authTokenName);
        const authStatus = await authenticate(token);
        if (authStatus.authError) {
          dispatch({type: AUTH_ERROR, error: authStatus.authError.message});
        }
      }
    }
  };
};
