import socketCluster from 'socketcluster-client';
import React, { Component,PropTypes } from 'react';
import promisify from 'es6-promisify';

// constants
const CONNECT_REQUEST = "@@socketCluster/CONNECT_REQUEST";
const CONNECT_SUCCESS = "@@socketCluster/CONNECT_SUCCESS";
const CONNECT_ERROR = "@@socketCluster/CONNECT_ERROR";
const AUTH_REQUEST = "@@socketCluster/AUTH_REQUEST";
const AUTH_SUCCESS = "@@socketCluster/AUTH_SUCCESS";
const AUTH_ERROR = "@@socketCluster/AUTH_ERROR";
//https://github.com/SocketCluster/socketcluster-client/issues/25
const SUBSCRIBE_REQUEST = "@@socketCluster/SUBSCRIBE_REQUEST";
const SUBSCRIBE_SUCCESS = "@@socketCluster/SUBSCRIBE_SUCCESS";
const SUBSCRIBE_ERROR = "@@socketCluster/SUBSCRIBE_ERROR";
const DISCONNECT = "@@socketCluster/DISCONNECT";
const DEAUTHORIZE = "@@socketCluster/DEAUTHORIZE";

// Action creators

function disconnect() {
  return {
    type: DISCONNECT
  }
}

function deauthorize() {
  return {
    type: DEAUTHORIZE
  }
}
function connectRequest(payload) {
  return {
    type: CONNECT_REQUEST,
    payload
  }
}

function connectSuccess(payload) {
  return {
    type: CONNECT_SUCCESS,
    payload
  }
}

function connectError(error) {
  return {
    type: CONNECT_ERROR,
    error
  }
}

function authRequest() {
  return {
    type: AUTH_REQUEST
  }
}

function authSuccess(payload) {
  return {
    type: AUTH_SUCCESS,
    payload
  }
}

function authError(error) {
  return {
    type: AUTH_ERROR,
    error
  }
}

function subscribeRequest() {
  return {
    type: SUBSCRIBE_REQUEST
  }
}

function subscribeSuccess(payload) {
  return {
    type: SUBSCRIBE_SUCCESS,
    payload
  }
}

function subscribeError(payload,error) {
  return {
    type: SUBSCRIBE_ERROR,
    payload,
    error
  }
}

// Reducer

const initialState = {
  state: 'closed',
  id: null,
  isAuthenticated: false,
  isAuthenticating: false,
  error: null,
  token: null,
  pendingSubs: [],
  subs: []
};

const socketClusterReducer = function (state = initialState, action) {
  switch (action.type) {
    case DEAUTHORIZE:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: false,
        error: null,
        token: null
      });
    case DISCONNECT:
      return Object.assign({}, state, {
        state: 'closed',
        id: null,
        isAuthenticating: false,
        isAuthenticated: false,
        error: null,
        token: null
      });
    case CONNECT_REQUEST:
      return Object.assign({}, state, {
        state: 'connecting',
        id: null,
        isAuthenticating: false,
        isAuthenticated: false,
        error: null
      });
    case CONNECT_ERROR:
      return Object.assign({}, state, {
        error: action.error
      });
    case CONNECT_SUCCESS:
      return Object.assign({}, state, {
        state: action.payload.state,
        id: action.payload.id,
        isAuthenticating: false,
        isAuthenticated: action.payload.isAuthenticated,
        error: action.payload.error || null
      });
    case AUTH_REQUEST:
      return Object.assign({}, state, {
        isAuthenticating: true
      });
    case AUTH_SUCCESS:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: true,
        error: null,
        token: action.payload.token
      });
    case AUTH_ERROR:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: false,
        error: action.error
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
        error: action.error
      });
    default:
      return state;
  }
}

// HOC
const reduxSocket = function (inOptions) {
  return function socketClusterer(ComposedComponent) {
    return class SocketClustered extends Component {
      static contextTypes = {
        store: React.PropTypes.object.isRequired
      };

      constructor(props, context) {
        super(props, context);
      }

      componentDidMount() {
        inOptions = inOptions || {};
        const {authLocalToken, ...options} = inOptions; //extract non-standard SC options here
        this.authLocalToken = authLocalToken;
        this.authTokenName = options.authTokenName;
        this.socket = socketCluster.connect(options);
        console.log(this.socket);
        this.handleConnection();
        this.handleAuth();
        this.handleDisconnect();
        this.handleDeauth();
        this.handleError();
        this.handleSubs();

      }

      render() {
        return (
          <ComposedComponent {...this.props}/>
        )
      }

      handleSubs() {
        const {dispatch} = this.context.store;
        const {socket} = this;
        socket.on('subscribeRequest', channelName => {
          dispatch(subscribeRequest({channelName}))
        })
        socket.on('subscribe', channelName => {
          dispatch(subscribeSuccess({channelName}))
        })
        socket.on('subscribeFail', (error,channelName) => {
          dispatch(subscribeError({channelName}, error))
        })
      }

      handleDeauth() {
        const {dispatch} = this.context.store;
        const {socket} = this;
        socket.on('removeAuthToken', () => {
          dispatch(deauthorize());
        });
      }

      handleDisconnect() {
        const {dispatch} = this.context.store;
        const {socket} = this;
        socket.on('disconnect', () => {
          dispatch(disconnect());
        });
        socket.transport.on('#disconnect', () => {
          console.log("INTERNAL DISCONNECT");
          dispatch(disconnect());
        });
        socket.on('connectAbort', () => { //triggers while in connecting state
          dispatch(disconnect());
        });
        setTimeout(() => {socket.disconnect()},3000);
      }

      handleConnection() {
        const {dispatch} = this.context.store;
        const {socket} = this;
        dispatch(connectRequest({state: socket.getState()}));
        socket.on('connect', status => {
          dispatch(connectSuccess({
            id: status.id,
            isAuthenticated: status.isAuthenticated,
            state: 'open',
            error: status.authError
          }));
        });
      }

      handleError() {
        const {dispatch} = this.context.store;
        const {socket} = this;
        socket.on('error', error => {
          dispatch(connectError({
            error
          }))
        })
      }

      async handleAuth() {
        const {dispatch} = this.context.store;
        const {socket, authLocalToken, authTokenName} = this;
        socket.on('authenticate', token => {
          dispatch(authSuccess({token}));
        });
        if (authTokenName && authLocalToken !== false) {
          dispatch(authRequest());
          const loadToken = promisify(socket.auth::socket.auth.loadToken); //https://youtrack.jetbrains.com/issue/WEB-18760
          const authenticate = promisify(socket::socket.authenticate);
          const token = await loadToken(authTokenName);
          const authStatus = await authenticate(token);
          if (authStatus.authError) {
            dispatch(authError(authStatus.authError.message));
          }
        }
      }
    }
  }
}

module.exports = {
  reduxSocket, socketClusterReducer
};

