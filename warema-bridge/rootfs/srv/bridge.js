const warema = require('./warema-wms-venetian-blinds');
const mqtt = require('mqtt')

originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    originalLog.apply(console.log,[getCurrentDateString()].concat(args));
};

function getCurrentDateString() {
    return (new Date()).toISOString() + ':';
};

process.on('SIGINT', function() {
    process.exit(0);
});

const ignoredDevices = process.env.IGNORED_DEVICES ? process.env.IGNORED_DEVICES.split(',') : []
const forceDevices = process.env.FORCE_DEVICES ? process.env.FORCE_DEVICES.split(',') : []

const settingsPar = {
    wmsChannel   : process.env.WMS_CHANNEL     || 17,
    wmsKey       : process.env.WMS_KEY         || '00112233445566778899AABBCCDDEEFF',
    wmsPanid     : process.env.WMS_PAN_ID      || 'FFFF',
    wmsSerialPort: process.env.WMS_SERIAL_PORT || '/dev/ttyUSB0',
  };

var registered_shades = []
var shade_position = {}

function registerDevice(element) {
  snr = String(element.snr).replace(/^0+/, '')
  console.log('Found device of type "' + element.typeStr + '" with type #' + element.type)
  console.log('Registering ' + snr)
  var topic = 'homeassistant/cover/' + snr + '/' + snr + '/config'
  var availability_topic = 'warema/' + snr + '/availability'

  var base_payload = {
    name: null,
    availability: [
      {topic: 'warema/bridge/state'},
      {topic: availability_topic}
    ],
    unique_id: snr
  }

  var base_device = {
    identifiers: snr,
    manufacturer: "Warema",
    name: snr
  }

  var model
  var payload
  switch (parseInt(element.type)) {
    case 63:
      model = 'Weather station Pro'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        }
      }          
      break;
    // WMS WebControl Pro - while part of the network, we have no business to do with it.
    case 9:
      return
    case 20:
      model = 'Plug receiver'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: 100,
        tilt_max: -100,
      }
      break;
    case 21:
      model = 'Actuator UP'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: 100,
        tilt_max: -100,
      }
      break;
    case 25:
      model = 'Vertical awning'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        set_position_topic: 'warema/' + snr + '/set_position',
      }
      break;
    case 28:
        model = 'LED';
        payload = {
            ...base_payload,
            device: {
                ...base_device,
                model: model
            },
            position_open: 0,
            position_closed: 100,
            state_topic: 'warema/' + snr + '/state',
            command_topic: 'warema/' + snr + '/set',
            position_topic: 'warema/' + snr + '/position',
            set_position_topic: 'warema/' + snr + '/set_position',
        }
        break;
    default:
      console.log('Unrecognized device type: ' + element.type)
      model = 'Unknown model ' + element.type
      return
  }

  if (ignoredDevices.includes(element.snr.toString())) {
    console.log('Ignoring device ' + snr + ' (type ' + element.type + ')')
  } else {
    if (!registered_shades.includes(snr)) {
      console.log('Adding device ' + snr + ' (type ' + element.type + ') to warema stick')
      stickUsb.vnBlindAdd(parseInt(element.snr), element.snr.toString());
      registered_shades.push(snr)
    }
    console.log('Publishing state of device ' + snr + ' (type ' + element.type + ') to Home Assistant')
    client.publish(availability_topic, 'online', {retain: true})
    client.publish(topic, JSON.stringify(payload), {retain: true})
  }
}

function registerDevices() {
  if (forceDevices && forceDevices.length) {
    forceDevices.forEach(element => {
      registerDevice({snr: element.split(':')[0], type: element.split(':')[1] ? element.split(':')[1] : 25 })
    })
  } else {
    console.log('Scanning...')
    stickUsb.scanDevices({autoAssignBlinds: false});
  }
}

/**
 * Publishes a discovery payload to MQTT to register a weather station
 * @param {number} snr 
 */
function registerWeatherStation(snr) {
  logger.debug("Registering Weather Station " + snr + " (" + (typeof snr) +")");
  var topic_base = 'homeassistant/sensor/warema/' + snr;

  var payload = {
    availability: [
      {topic: 'warema/bridge/state'},
      {topic: topic_base + '/availability'}
    ],
    state_topic: topic_base + '/state',
    device: {
      identifiers: snr,
      manufacturer: 'Warema',
      model: 'Weather Station',
    },
    force_update: true
  }

  client.publish( topic_base + '_illuminance/config', JSON.stringify({
      ...payload,
      unique_id: snr + '_illuminance',
      value_template: '{{value_json.illuminance}}',
      device_class: 'illuminance',
      unit_of_measurement: 'lx',
    }));

  client.publish( topic_base + '_temperature/config', JSON.stringify({
    ...payload,
    unique_id: snr + '_temperature',
    value_template: '{{value_json.temperature}}',
    device_class: 'temperature',
    unit_of_measurement: '°C',
  }))

  client.publish( topic_base + '_wind/config', JSON.stringify({
    ...payload,
    unique_id: snr + '_wind',
    value_template: '{{value_json.wind}}',
  }))

  client.publish( topic_base + '_rain/config', JSON.stringify({
    ...payload,
    unique_id: snr + '_rain',
    value_template: '{{value_json.rain}}',
  }))

  client.publish( topic_base + '/availability', 'online', {retain: true})
  registered_shades += snr
}

function callback(err, msg) {
  if(err) {
    console.log('ERROR: ' + err);
  }
  if(msg) {
    switch (msg.topic) {
      case 'wms-vb-init-completion':
        console.log('Warema init completed')
        registerDevices()
        stickUsb.setPosUpdInterval(10000);
        stickUsb.setWatchMovingBlindsInterval(1000)
        break;
      case 'wms-vb-rcv-weather-broadcast':
        if (registered_shades.includes(msg.payload.weather.snr)) {
          client.publish('homeassistant/sensor/warema/' + msg.payload.weather.snr + '/state', JSON.stringify( msg.payload.weather ));
        } else {
          registerWeatherStation(msg.payload.weather.snr);
        }
        break;
      case 'wms-vb-blind-position-update':
        client.publish('warema/' + msg.payload.snr + '/position', msg.payload.position.toString(), {retain: true})
        client.publish('warema/' + msg.payload.snr + '/tilt', msg.payload.angle.toString(), {retain: true})
        shade_position[msg.payload.snr] = {
          position: msg.payload.position,
          angle: msg.payload.angle
        }
        break;
      case 'wms-vb-scanned-devices':
        console.log('Scanned devices.')
        msg.payload.devices.forEach(element => registerDevice(element))
        console.log(stickUsb.vnBlindsList())
        break;
      default:
        console.log('UNKNOWN MESSAGE: ' + JSON.stringify(msg));
    }
  }
}

var stickUsb = null

const client = mqtt.connect(
  process.env.MQTT_SERVER,
  {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
    will: {
      topic: 'warema/bridge/state',
      payload: 'offline',
      retain: true
    }
  }
)

client.on('connect', function (connack) {
  console.log('Connected to MQTT')
  client.subscribe('warema/#')
  client.subscribe('homeassistant/status')
  if (stickUsb == null) {
    stickUsb = new warema(settingsPar.wmsSerialPort,
      settingsPar.wmsChannel,
      settingsPar.wmsPanid,
      settingsPar.wmsKey,
      {},
      callback
    );
  }
  client.publish('warema/bridge/state', 'online', {retain: true})
})

client.on('error', function (error) {
  console.log('MQTT Error: ' + error.toString())
})

client.on('reconnect', () => {
  console.log('Reconnecting to MQTT');
});

client.on('message', function (topic, message) {
  var scope = topic.split('/')[0]
  if (scope == 'warema') {
    var device = parseInt(topic.split('/')[1])
    var command = topic.split('/')[2]
    switch (command) {
      case 'set':
        switch (message.toString()) {
          case 'CLOSE':
            console.log('Sending CLOSE command to device: ' + device)
            stickUsb.vnBlindSetPosition(device, 100, 100)
            break;
          case 'OPEN':
            console.log('Sending OPEN command to device: ' + device)
            stickUsb.vnBlindSetPosition(device, 0, -100)
            break;
          case 'STOP':
            console.log('Sending STOP command to device: ' + device)
            stickUsb.vnBlindStop(device)
            break;
        }
        break;
      case 'set_position':
        console.log('Sending set_position to "' + message + '" command to device:' + device)
        stickUsb.vnBlindSetPosition(device, parseInt(message), parseInt(shade_position[device]['angle']))
        break;
      case 'set_tilt':
        console.log('Sending set_tilt to "' + message + '" command to device:' + device)
        stickUsb.vnBlindSetPosition(device, parseInt(shade_position[device]['position']), parseInt(message))
        break;
    }
  } else if (scope == 'homeassistant') {
    if (topic.split('/')[1] == 'status') {
      switch (message.toString()) {
        case 'online':
          console.log('Home Assistant is online now')
          registerDevices()
          break;
        default:
          console.log('Home Assistant is ' + message.toString() +' now')
      }
    }
  }
})
