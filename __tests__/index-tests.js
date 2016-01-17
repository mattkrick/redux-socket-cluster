import test from 'ava';
import 'babel-register';
import 'babel-polyfill';
import {createStore} from 'redux';
import {connect, Provider} from 'react-redux';
import socketCluster from 'socketcluster-client';
import TestUtils from 'react-addons-test-utils'
import {socketClusterReducer, reduxSocket} from '../src/index';
import makeServer from './setup/testServer.babel.js';
import {Map, List, is} from 'immutable';

const socketOptions = {hostname: 'localhost'};
const endTest = (t, port) => {
  socketOptions.port = port;
  const socket = socketCluster.connect(socketOptions);
  socket.emit('close', null, () => {
    t.end();
  });
};

//const delay = (ms) => new Promise(resolve => {
//  setTimeout(() => {
//    resolve()
//  },ms)});

//test.beforeEach(t => {
//  t.context.React = require('react');
//});

//test.after(async t => {
//  await delay(1000);
//  console.log('closing tests');
//})

test.cb('pass through props to container', t => {
  t.plan(1);
  require('./setup/dom');
  const port = parseInt(Math.random() * 65536);
  const React = require('react');
  const {Component} = React;
  makeServer(() => {
    @connect()
    @reduxSocket(socketOptions)
    class Container extends Component {
      render() {
        return <div {...this.props} />
      }
    }
    const tree = TestUtils.renderIntoDocument(
      <Container pass="through"/>
    );
    const container = TestUtils.findRenderedComponentWithType(tree, Container);
    t.is(container.props.pass, 'through');
    endTest(t, port);
  }, port);
});

////TODO http://stackoverflow.com/questions/34698647/testing-a-property-of-a-react-hoc
// TODO https://discuss.reactjs.org/t/testing-lifecycle-methods-in-higher-order-components/2897
test.cb('set options and sockets on container object', t => {
  t.plan(1);
  require('./setup/dom');
  const port = parseInt(Math.random() * 65536);
  const React = require('react');
  const {Component} = React;
  const store = createStore(() => {
  }, {});
  makeServer(() => {
    class Container extends Component {
      render() {
        return <div {...this.props} />
      }
    }

    class WrappedCont extends Component {
      render() {
        return (
          <Provider store={store}>
            <Container/>
          </Provider>
        )
      }
    }

    const ConnectedCont = connect()(WrappedCont);
    console.log('CC')
    const hoc = reduxSocket(socketOptions)(ConnectedCont);
    const instance = new hoc;
    instance.componentWillMount();
    console.log('INSTANCE', instance);
    //const shallowRenderer = TestUtils.createRenderer();
    //shallowRenderer.render(<reduxSocket/>);
    //t.is(shallowRenderer.getMountedInstance().clusteredOptions, 5000);
    endTest(t, port);
  }, port);
});

test('reducer sets initial state given undefined', t => {
  t.plan(1);
  const store = createStore(socketClusterReducer, undefined);
  t.true(is(store.getState(), Map({
    id: null,
    socketState: 'closed',
    authState: 'pending',
    authToken: null,
    authError: null,
    error: null,
    pendingSubs: List(),
    subs: List()
  })));
});
