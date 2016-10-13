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

// HOC
export const reduxSocket = (options = {}, hocOptions) => ComposedComponent =>
  class SocketClustered extends Component {
    static contextTypes = {
      store: React.PropTypes.object.isRequired
    };

    constructor(props, context) {
      super(props, context);
      const {AuthEngine} = hocOptions;
      const newOptions = AuthEngine ? {...options, authEngine: new AuthEngine(context.store)} : options;
      const socketCluster = hocOptions.socketCluster;
      this.state = {
        options: newOptions,
        socketCluster,
        hocOptions: Object.assign({
          keepAlive: 15000
        }, hocOptions),
        socket: socketCluster.connect(newOptions),
        authTokenName: newOptions.authTokenName
      }
    }

    componentWillMount() {
      const {socket, hocOptions, options} = this.state;
      const {onConnect} = hocOptions;
      if (onConnect) {
        onConnect(options, hocOptions, socket);
      }
      if (!socket.__destructionCountdown) {
        this.handleConnection();
        this.handleError();
        this.handleSubs();
        this.handleAuth();
        // brand the socket in case the user uses this hoc more than once
        socket.__destructionCountdown = true;
        return;
      }
      clearTimeout(socket.__destructionCountdown);
    }

    componentWillUnmount() {
      const {socket, socketCluster, hocOptions, options} = this.state;
      const {onDisconnect, keepAlive} = hocOptions;
      socket.__destructionCountdown = keepAlive < Number.MAX_SAFE_INTEGER ?
        setTimeout(() => {
          socket.disconnect();
          socketCluster.destroy(options);
          if (onDisconnect) {
            onDisconnect(true, options, hocOptions, socket);
          }
        }, keepAlive)
        // never close if set to Infinity
        : true;
    }

    render() {
      return (
        <ComposedComponent {...this.props}/>
      );
    }

    handleSubs() {
      const {dispatch} = this.context.store;
      const {socket} = this.state;
      socket.on('subscribeStateChange', (channelName, oldState, newState) => {
        if (newState === PENDING) {
          dispatch({type: SUBSCRIBE_REQUEST, payload: {channelName}});
        }
      });
      socket.on('subscribeRequest', channelName => {
        // delay the dispatch in case someone subs inside a render
        dispatch({type: SUBSCRIBE_REQUEST, payload: {channelName}});
        // setTimeout(() => dispatch({type: SUBSCRIBE_REQUEST, payload: {channelName}}),0);
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
      const {socket, hocOptions, options} = this.state;

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
      const {socket} = this.state;
      socket.on('error', error => {
        dispatch({type: CONNECT_ERROR, error: error.message});
      });
    }

    async handleAuth() {
      const {dispatch} = this.context.store;
      const {socket, authTokenName} = this.state;
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
