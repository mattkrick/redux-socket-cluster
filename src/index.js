import React, {Component} from 'react';
import promisify from 'es6-promisify';

// constants
const CLOSED = 'closed';
const CONNECTING = 'connecting';
const OPEN = 'open';
const AUTHENTICATED = 'authenticated';
const PENDING = 'pending';
const UNAUTHENTICATED = 'unauthenticated';

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
const initialState = {
  id: null,
  socketState: CLOSED,
  authState: PENDING,
  authToken: null,
  authError: null,
  error: null,
  pendingSubs: [],
  subs: []
};

export const socketClusterReducer = function (state = initialState, action) {
  switch (action.type) {
    case DEAUTHENTICATE:
      return {
        ...state,
        authState: UNAUTHENTICATED,
        authToken: null
      };
    case DISCONNECT:
      return initialState;
    case CONNECT_REQUEST:
      return {
        ...state,
        socketState: CONNECTING
      };
    case CONNECT_ERROR:
      return {
        ...state,
        error: action.error
      };
    case CONNECT_SUCCESS:
      return {
        ...state,
        id: action.payload.id,
        socketState: action.payload.socketState,
        authState: action.payload.authState,
        error: action.error
      };
    case AUTH_REQUEST:
      return {
        ...state,
        authState: PENDING
      };
    case AUTH_SUCCESS:
      return {
        ...state,
        authState: AUTHENTICATED,
        authToken: action.payload.authToken
      };
    case AUTH_ERROR:
      return {
        ...state,
        authState: UNAUTHENTICATED,
        authError: action.error
      };
    case SUBSCRIBE_REQUEST:
      return {
        ...state,
        pendingSubs: state.pendingSubs.concat(action.payload.channelName)
      };
    case SUBSCRIBE_SUCCESS:
      return {
        ...state,
        pendingSubs: state.pendingSubs.filter(sub => sub !== action.payload.channelName),
        subs: state.subs.concat(action.payload.channelName)
      };
    case SUBSCRIBE_ERROR:
      return {
        ...state,
        pendingSubs: state.pendingSubs.filter(sub => sub !== action.payload.channelName),
        error: action.error
      };
    case UNSUBSCRIBE:
      return {
        ...state,
        subs: state.subs.filter(sub => sub !== action.payload.channelName),
        error: action.error
      };
    case KICKOUT:
      return {
        ...state,
        error: action.error
      };
    default:
      return state;
  }
};

// HOC
export const reduxSocket = (options, hocOptions) => ComposedComponent =>
  class SocketClustered extends Component {
    static contextTypes = {
      store: React.PropTypes.object.isRequired
    };

    constructor(props, context) {
      super(props, context);
      options = options || {};
      this.options = options;
      const {AuthEngine} = hocOptions;
      this.socketCluster = hocOptions.socketCluster || socketCluster;
      if (AuthEngine) {
        this.options.authEngine = new AuthEngine(context.store);
      }
      this.hocOptions = Object.assign({
        keepAlive: 15000
      }, hocOptions);
    }

    componentWillMount() {
      this.socket = this.socketCluster.connect(this.options);
      this.authTokenName = this.options.authTokenName;
      if (!this.socket.__destructionCountdown) {
        this.handleConnection();
        this.handleError();
        this.handleSubs();
        this.handleAuth();
        const {onConnect} = this.hocOptions;
        if (onConnect) {
          onConnect(this.options, this.hocOptions, this.socket);
        }
        return;
      }
      clearTimeout(this.socket.__destructionCountdown);
    }

    componentWillUnmount() {
      this.socket.__destructionCountdown = setTimeout(() => {
        this.socket.disconnect();
        this.socket = this.socketCluster.destroy(options);
        const {onDisconnect} = this.hocOptions;
        if (onDisconnect) {
          onDisconnect(true, this.options, this.hocOptions, this.socket);
        }
      }, this.hocOptions.keepAlive);
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
      socket.on('subscribeRequest', channelName => {
        dispatch({type: SUBSCRIBE_REQUEST, payload: {channelName}});
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
        const {onDisconnect} = this.hocOptions;
        if (onDisconnect) {
          // did not time out, so first param is false
          onDisconnect(false, this.options, this.hocOptions, this.socket);
        }
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
