const urlUtil = require('url')
const meowserify = require('meowserify')
const RPC = require('frame-rpc')
const EventEmitter = require('events').EventEmitter
const inherits = require('util').inherits
const extend = require('xtend')
const iframe = require('iframe')
const PrefixedStorage = require('./lib/prefixed-storage.js')
const SimpleLock = require('./lib/simple-lock.js')
const preambleSrc = meowserify(__dirname+'/frame.js')
const preambleBody = '<'+'script type="text/javascript"'+'>'+preambleSrc+'<'+'/script'+'>'

module.exports = DappSandbox

inherits(DappSandbox, EventEmitter)
function DappSandbox(opts){
  var self = this
  EventEmitter.call(self)

  // setup initialization lock
  self.lock = new SimpleLock()
  self.lock.lock()

  // setup iframe
  var iframeConfig = { container: opts.container }
  iframeConfig.body = preambleBody
  iframeConfig.sandboxAttributes = ['allow-scripts', 'allow-forms', 'allow-popups']
  var frame = self.iframe = iframe(iframeConfig).iframe
  var srcUrl = new URL(frame.getAttribute('src'))
  var origin = srcUrl.host ? srcUrl.origin : '*'
  frame.addEventListener('load', initializeRpc)

  function initializeRpc(ev) {
    frame.removeEventListener('load', initializeRpc)
    self.emit('load')
    self.rpc = RPC(window, frame.contentWindow, origin, {
      urlChanged: function(url){
        self.emit('url', url)
      },
      signTx: function(txParams, cb){
        self.emit('tx', txParams, cb)
      },
      updateLocalStorage: function(data){
        self.localStorage.setData(data)
      },
      updateSessionStorage: function(data){
        self.sessionStorage.setData(data)
      },
    })
    self.rpc.call('initialize', opts.config)
    self.lock.unlock()
  }
}

DappSandbox.prototype.navigateTo = function(url){
  var self = this
  // await initialization
  self.lock.await(function(){
    // inject storage
    var urlData = urlUtil.parse(url)
    var domain = urlData.protocol+'//'+urlData.host
    self.localStorage = new PrefixedStorage(domain+'->', window.localStorage)
    self.sessionStorage = new PrefixedStorage(domain+'->', window.sessionStorage)
    // trigger navigation
    self.rpc.call('navigateTo', url, self.localStorage.toJSON(), self.sessionStorage.toJSON())
  })
}
