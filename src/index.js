import socketCluster from 'socketcluster-client';
import React, { Component,PropTypes } from 'react';

// constants
const CONNECT_REQUEST = "@@socketCluster/CONNECT_REQUEST";
const CONNECT_SUCCESS = "@@socketCluster/CONNECT_SUCCESS";
const CONNECT_ERROR = "@@socketCluster/CONNECT_ERROR"; //TODO ask about this, it's not clear in the SC API
const AUTH_REQUEST = "@@socketCluster/AUTH_REQUEST";
const AUTH_SUCCESS = "@@socketCluster/AUTH_SUCCESS";
const AUTH_ERROR = "@@socketCluster/AUTH_ERROR";
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
    type: DISCONNECT
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

function authRequest() {
  return {
    type:AUTH_REQUEST
  }
}

function authSuccess(payload) {
  return {
    type:AUTH_SUCCESS,
    payload
  }
}

function authError(error) {
  return {
    type:AUTH_ERROR,
    error
  }
}

// Reducer

const initialState = {
  state: 'closed',
  id: null,
  isAuthenticated: false,
  isAuthenticating: false,
  authError: null,
  token: null,
  subscriptions: [] //TODO, handle subs, kickouts,
};

export function socketClusterReducer(state = initialState, action) {
  switch (action.type) {
    case DEAUTHORIZE:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: false,
        authError: null,
        token: null
      });
    case DISCONNECT:
      return Object.assign({}, state, {
        state: 'closed',
        id: null,
        isAuthenticating: false,
        isAuthenticated: false,
        authError: null,
        token: null
      });
    case CONNECT_REQUEST:
      return Object.assign({}, state, {
        state: 'connecting',
        id: null,
        isAuthenticating: false,
        isAuthenticated: false,
        authError: null
      });
    case CONNECT_ERROR:
      return Object.assign({}, state, {
        state: 'closed',
        id: null,
        isAuthenticating: false,
        isAuthenticated: false,
        authError: null,
        token: null
      });
    case CONNECT_SUCCESS:
      return Object.assign({}, state, {
        state: action.payload.state,
        id: action.payload.id,
        isAuthenticating: false,
        isAuthenticated: action.payload.isAuthenticated,
        authError: action.payload.authError || null
      });
    case AUTH_REQUEST:
      return Object.assign({}, state, {
        isAuthenticating: true
      });
    case AUTH_SUCCESS:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: true,
        authError: null,
        token: action.payload.token
      });
    case AUTH_ERROR:
      return Object.assign({}, state, {
        isAuthenticating: false,
        isAuthenticated: false,
        authError: action.error
      });
    default:
      return state;
  }
}

// HOC
export function reduxSocket(inOptions) {
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
        this.handleConnection();
        this.handleAuth();
        this.handleDisconnect();
        this.handleDeauth();

      }

      render() {
        return (
          <ComposedComponent {...this.props}/>
        )
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
        socket.on('connectAbort', () => { //triggers while in connecting state
          dispatch(disconnect());
        });
      }

      handleConnection() {
        const {dispatch} = this.context.store;
        const {socket} = this;
        dispatch(connectRequest({state: socket.getState()}));
        socket.on('connect', function (status) {
          dispatch(connectSuccess({
            id: status.id,
            isAuthenticated: status.isAuthenticated,
            state: 'open',
            authError: status.authError
          }));
        });
      }

      handleAuth() {
        //TODO: use socket.auth.loadToken instead?
        const {dispatch} = this.context.store;
        const {socket, authLocalToken, authTokenName} = this;
        if (authTokenName && authLocalToken !== false) {
          dispatch(authRequest());
          const token = window.localStorage.getItem(authTokenName);
          socket.authenticate(token, (err, status) => {
            const socketAuthError = status.authError && status.authError.message;
            if (socketAuthError) {
              dispatch(authError(socketAuthError));
            }
          });
        }
        socket.on('authenticate', (token) => {
          dispatch(authSuccess({token}));
        });
      }
    }
  }
}
