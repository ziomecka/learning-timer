/* jshint esversion: 6 */
import "babel-polyfill";
import Defaults from "./mytimer.defaults";
import helpers from "./mytimer.helpers";
let hOP = helpers.hOP;
let isObject = helpers.isObject;

/** @type {WeakMap} Used to store private objects */
const _privateObjects = new WeakMap();
/**
 * WeakMap that stores MyTimers' private objects.
 * Those objects are instances of MyTimer's Defaults.
 * The WeakMap returns function, that returns those private objects.
 *
 * @param   {MyTimer}   obj Instance of MyTimer.
 * @returns {Function}      Function that returns the private object.
 */
const createPrivateObject = (obj) => {
  _privateObjects.set(obj, new Defaults());
  return () => _privateObjects.get(obj);
};

export default class MyTimer {
  /**
   * [constructor description]
   *
   * @param  {Object}   timerOptions TODO
   */
  constructor(timerOptions) {
    /** Create private object (Defaults) via the WeakMap. */
    let _this = createPrivateObject(this)();
    /** Reveal the private object. ONLY FOR TESTS. */
    this._this = _this;

    /** verify arguments */
    if (timerOptions && isObject(timerOptions)) {
      /** verify session and interval steps */
      if (hOP(timerOptions, "steps") && isObject(timerOptions.steps)) {
        for (let step of _this.steps.keys()) {
          let options = timerOptions.steps[step];
          /** Check:
              are there options?
              are options an object?
              */
          if (options && isObject(options)) {
            try {
              _this[step] = options;
              /** Adjust interval value. Done here, because:
                  if interval step is set incorrectly then
                  the Error will be caught and smoothing will not be performed.
                  **/
              if (step === "interval" && _this.smooth === "yes") {
                _this.smoothInterval();
              }
            } catch(e) {
              /** Warn: initialised with defaults. */
              console.warn(`Timer has been initialised with different values than those specified in constructor's call.`);
            }
          } else {
            /** Warn: initialised with defaults. */
            console.warn(`Timer has been initialised with different values than those specified in constructor's call.`);
          }
          /** Garbage collect */
          options = null;
        }
      }

      /** Reveal MyTimer's counting direction */
      if (hOP(timerOptions, "direction")) _this.direction = timerOptions.direction;

      /** Are countUnits provided in arguments? */ // TODO is the check needed??
      if (hOP(timerOptions, "countUnits")) {
        try {
          _this.countUnits = timerOptions.countUnits;
        } catch (e) {
          throw e;
        }
      }
    }

    /** Steal "createTimeMethods" from the hidden object in order to
        create MyTimer's methods that will return time values.
        */
    _this.createTimeMethods.call(this, _this);

    /** Create MyTimer's events. */
    this.event = (() => {
      let listeners = _this.listeners;
      _this.events.forEach((event) => listeners[event] = []);
      return {
        subscribe: (listener, eventName, method) => {
          const index = listeners[eventName].push({listener: listener, method: method}) - 1;
          return {
            remove: () => delete listeners[eventName][index]
          };
        },
        publish: (eventName) => {
          listeners[eventName].forEach((listener) => {
            listener.listener[listener.method]();
          });
        }
      };
    })();
  }

  start() {
    let _this = _privateObjects.get(this);
    _this.start = Date.now();
    let publishTime = () => {
      _this.now = Date.now();
      this.event.publish("currentTime");
      if (_this.ellapsed >= _this.session) {
        _this = null;
        this.stop();
      }
    };
    /** start timer only if it has not been counting already */
    if (!_this.isCounting) {
      _this.start = Date.now();
      _this.isCounting = true;
      /** publish time at predefined intervals */
      _this.countDown = setInterval(publishTime(), _this.interval);
      this.event.publish("sessionStarted");
      return this;
    } else {
      _this = null;
      return false;
    }
  }

  stop() {
    let _this = _privateObjects.get(this);

    if (_this.isCounting) {
      let now = Date.now();
      let maximumTime = _this.start + _this.session;
      const countDown = _this.countDown;
      _this.now = (now > maximumTime)? maximumTime : now;
    	if (countDown) clearInterval(countDown);
    	_this.countDown = null; //TODO is needed?
    }
      _this.isStopped = true;
      _this = null;
      this.event.publish("sessionStopped");

    _this = null;
    return this;
  }

  pause() {
    let _this = _privateObjects.get(this);
    if (_this.isCounting) {
      const countDown = _this.countDown;
      _this.now = Date.now();
      _this.isPaused = true;
    	if (countDown) clearInterval(countDown);
      _this = null;
      this.event.publish("sessionPaused");
      return this;
    }
    _this = null;
    return false;
  }

  reset() {
    let _this = _privateObjects.get(this);
		this.stop();
    _this.start = Date.now();
		_this.now = Date.now();
    _this = null;
    this.event.publish("timerReset");
  }

  /**
  * Changes value of step (interval, session).
  *
  * @param   {object}   options Object with mandatory properties:
  *                             "step", "value" and "units" and
  *                             optional properties:
  *                             "sign" and "increment".
  */
  changeStep(options) {
    let _this = _privateObjects.get(this);
    let step = options.step;
    let newValue = 0;
    let value, sign, increment;

    /** check arguments */
    let verifyArgs = function() {
      if ((_this.steps.has(step)) && options && options.value && options.units) {
        /** get options */
        ({value: value, sign: sign = 1, increment: increment = 0} = options);
        /** if options units !== "milliseconds" then convert to milliseconds */
        if (options.units !== "milliseconds") value = _this.convert(options);
        /** if sign is neither 1 nor -1, make it 1 */
        if (!sign || Math.abs(sign) !== 1) sign = 1;
        /** if increment is neither 0 nor 1, make it 0 */
        if (!increment || (increment !== 0 && increment !== 1)) increment = 0;
        /** calculate newSession by adding / substracting value */
        value = value * sign;
        return true;
      }
    };

    /** steps' procedures */
    let stepProcedure = {
      "session": (value) => {
        /** session length cannot be shorter than the time ellapsed */
        if (_this.isCounting && (value > (_this.ellapsed))) {
          _this[step] = value;
        } else {
          _this[step] = value;
        }
        this.event.publish("sessionChanged");
        this.event.publish("currentTime");
      },
      "interval": () => {
        // TODO
      }
    };

    /** if arguments are correct */
    if(verifyArgs()) {
      newValue = (increment? (_this[step] + value) : value);
      newValue = newValue > 0? newValue : 0;
      /** perform procedure for particular step */
      stepProcedure[step](newValue);
    } else {
      console.warn("Step has not been changed becuse of incorrect arguments.");
    }
    /** garbage collect */
    _this = null;
	}

  toggle(method = "pause") {
    // TODO check method
		if (!this[method]()) this.start();
	}

  get status() {
    return _privateObjects.get(this).status;
  }

  get session() {
    return _privateObjects.get(this).session;
  }
}
