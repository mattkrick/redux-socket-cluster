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

export const socketClusterReducer = function(state = initialState, action) {
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

// keep in outer context so we can check if it exists in the maintainSocket HOC
let initialized = false;
let instances = 0;
let destructionId;
let destroyer;
let options = {};
let hocOptions = {};
let socket;
const hocOptionsDefaults = {keepAlive: 15000};

export const reduxSocket = (scOptions = {}, _hocOptions = {}) => ComposedComponent =>
  class SocketClustered extends Component {
    static contextTypes = {
      store: React.PropTypes.object.isRequired
    };

    constructor(props, context) {
      super(props, context);
      const {AuthEngine, onDisconnect, socketCluster} = _hocOptions;
      options = AuthEngine ? {...scOptions, authEngine: new AuthEngine(context.store)} : scOptions;
      hocOptions = {...hocOptionsDefaults, ..._hocOptions};
      socket = socketCluster.connect(options);
      destroyer = () => {
        socket.disconnect();
        socketCluster.destroy(scOptions);
        if (onDisconnect) {
          onDisconnect(true, scOptions, _hocOptions, socket);
        }
        initialized = false;
      }
    }

    componentWillMount() {
      if (!initialized) {
        // apply callback here so it happens on the same tick
        const {onConnect} = hocOptions;
        if (onConnect) {
          onConnect(options, hocOptions, socket);
        }
        this.handleConnection();
        this.handleError();
        this.handleSubs();
        this.handleAuth();
        initialized = true;
      } else if (destructionId) {
        // a second instance of the HOC was used or the first is revisited
        window.clearTimeout(destructionId);
        destructionId = undefined;
      }
      instances++;
    }

    componentWillUnmount() {
      // if this is the last place the socket was used, try to destroy it
      if (--instances === 0) {
        const {keepAlive} = hocOptions;
        if (Number.isFinite(keepAlive)) {
          destructionId = window.setTimeout(destroyer, keepAlive)
        }
      }
    }

    render() {
      return <ComposedComponent {...this.props}/>;
    }

    handleSubs() {
      const {dispatch} = this.context.store;
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
        const {onConnect} = hocOptions;
        if (onConnect) {
          onConnect(options, hocOptions, socket);
        }
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
        const {onDisconnect} = hocOptions;
        if (onDisconnect) {
          // did not time out, so first param is false
          onDisconnect(false, options, hocOptions, socket);
        }
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
      const {authTokenName} = options;
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

export const maintainSocket = ComposedComponent => {
  return class MaintainSocket extends Component {
    componentWillMount() {
      window.clearTimeout(destructionId);
      instances++;
    }

    componentWillUnmount() {
      if (--instances === 0) {
        const {keepAlive} = options;
        if (Number.isFinite(keepAlive)) {
          destructionId = window.setTimeout(destroyer, keepAlive)
        }
      }
    }

    render() {
      return <ComposedComponent {...this.props}/>;
    }
  }
};

