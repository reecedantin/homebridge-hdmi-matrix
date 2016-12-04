//HDMI PLATFORM

require('events').EventEmitter.prototype._maxListeners = 100;
var net = require("net");
var Service, Characteristic, Accessory, uuid;
var inherits = require('util').inherits;
var extend = require('util')._extend;

//var currentIO = ["o01i01", "o02i01", "o03i01", "o04i01", "o05i01", "o06i01", "o07i01", "o08i01"];
var clients = [];
var clientsCurrentIO = [];


/* Register the plugin with homebridge */
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;
    uuid = homebridge.hap.uuid;

    var acc = MatrixAccessory.prototype;
    inherits(MatrixAccessory, Accessory);
    MatrixAccessory.prototype.parent = Accessory.prototype;
    for (var mn in acc) {
        MatrixAccessory.prototype[mn] = acc[mn];
    }

    homebridge.registerPlatform("homebridge-hdmi-matrix", "HDMIMatrix",MatrixPlatform);
    //homebridge.registerAccessory("homebridge-hdmi-matrix", "HDMIMatrix",MatrixAccessory);
}

function MatrixPlatform(log, config) {
    this.log = log;
    this.devices = config.devices;
}

MatrixPlatform.prototype.accessories = function (callback) {
    if (Array.isArray(this.devices)) {
        var devicesProcessed = 0;
        for (var deviceIndex = 0; deviceIndex < this.devices.length; deviceIndex++) {
            var results = [];
            var currentDeviceConfig = this.devices[deviceIndex];

            clientsCurrentIO.push([]);
            var currentIO = clientsCurrentIO[deviceIndex];
            clients.push(new net.Socket());
            var client = clients[deviceIndex];
            client.log = this.log;

            var port = currentDeviceConfig.port;
            var host = currentDeviceConfig.host;

            client.connect(port, host, function () {
                this.log("Connected to " + host + ":" + port);
            });

            // client.setTimeout(10000, function (err) {
            //     this.log("Timed out connecting to " + host + ":" + port);
            //     client.destroy();
            // });

            var responseCount = 0;
            var finishedLoadingDevices = false;
            client.on('data', function (data) {
                if(!finishedLoadingDevices) {
                    var response = data.toString('utf-8').trim();
                    var checkready = response.split("\n");

                    if (responseCount == 0) {
                        client.write('admin\r\n');
                    } else if (responseCount == 1) {
                        client.write('123\r\n');
                    } else if (responseCount == 2) {
                        client.write("STMAP" + '\r\n');
                    } else if (responseCount > 2 && checkready.length > 3) {
                        currentIO = response.split('\n');
                        if (currentIO.length == currentDeviceConfig.outputs.length + 1) {
                            var tempIO = [];
                            for (var i = 0; i < currentIO.length-1; i++) {
                                tempIO.push(currentIO[i].substring(0,6));
                            }
                            currentIO = tempIO;
                        } else if(currentIO.length == currentDeviceConfig.outputs.length + 2) {
                            var tempIO = [];
                            for (var i = 1; i < currentIO.length-1; i++) {
                              tempIO.push(currentIO[i].substring(0,6));
                            }
                            currentIO = tempIO;
                        }
                        this.log("CURRENT IO: " + currentIO);

                        if (currentIO.length == currentDeviceConfig.outputs.length) {
                            this.log("Found " + currentIO.length + "x" + currentIO.length +  " matrix.");
                            for (var i = 0; i < currentDeviceConfig.outputs.length; i++) {
                                if (currentDeviceConfig.outputs[i] !== "") {
                                    for (k = 0; k < currentDeviceConfig.inputs.length; k++) {
                                        if (currentDeviceConfig.inputs[k] !== "") {
                                            results.push(new MatrixAccessory(this.log, i, k, client, currentDeviceConfig, currentIO));
                                            devicesProcessed++;
                                        }
                                    }
                                }
                            }
                            if (results.length === 0)
                            {
                                  this.log("WARNING: No Accessories were loaded.");
                            }
                            callback(results);
                        } else {
                            this.log(new Error("Unexpected response in fetching devices from matrix: " + results));
                            callback(results);
                        }
                        finishedLoadingDevices = true;
                    }
                    responseCount++;
                }
            });
        }
    }
}

function MatrixAccessory(log, output, input, client, config, io) {
    this.log = log;
    this.name = config.inputs[input] + " " + config.outputs[output];
    this.host = config.host;
    this.port = config.port;
    this.log("Configuring matrix accessory.  Name: " + this.name + ", Device: " + config.name);
    this.toggleMode = false;
    this.commands = {};

    this.output = output;
    this.input = input;
    this.selfSet = false;
    this.client = client;
    this.currentIO = io[this.output];

    var id = uuid.generate('matrix.' + "." + this.host + "." + output + "." + input);
    Accessory.call(this, this.name, id);
    this.uuid_base = id;


    this.services = [];
    this.service = new Service.Switch(this.name);
    this.service.subtype = "default";
    this.service
        .getCharacteristic(Characteristic.On)
        .on('set', this.setState.bind(this))
        .on('get', this.getState.bind(this));
    this.services.push(this.service);

    if (this.currentIO.slice(5,6) == (this.input+1)) {
      this.selfSet = true;
      this.service
        .getCharacteristic(Characteristic.On)
        .setValue(true);
    } else {
      this.selfSet = true;
      this.service
        .getCharacteristic(Characteristic.On)
        .setValue(false);
    }

    this.client.on('data', function (data) {
        var response = data.toString('utf-8').trim();
        var checkready = response.split("\n");

        if (checkready.length == 2) {
            if (checkready[0].slice(2,3) == this.output+1) {
                if(checkready[0].slice(5,6) == this.input+1) {
                    this.log("Recieved command: " + this.name);
                    this.selfSet = true;
                    this.service
                      .getCharacteristic(Characteristic.On)
                      .setValue(true);
                } else {
                    this.selfSet = true;
                    this.service
                      .getCharacteristic(Characteristic.On)
                      .setValue(false);
                }
            }
        }
    }.bind(this));

    this.client.on('close', function () {
        this.log("Connection lost to " + this.name);
    }.bind(this));
}

MatrixAccessory.prototype.getServices = function () {
    return this.services;
}

MatrixAccessory.prototype.setState = function (state, callback) {
    var command = "0000";

    if (state == '1') {
        command = "0" + (this.output + 1) + "0" + (this.input + 1);
    } else {
        command = "0" + (this.output + 1) + "00";
    }

    this.currentIO = "o0"+ (this.output+1) + "i0" + (command.slice(3,4));

    if (this.selfSet) {
      this.selfSet = false;
      callback(null);
      return;
    }

    this.client.write(command + "\r\n");
    callback(null);
}

MatrixAccessory.prototype.getState = function (callback) {
    callback(null, this.currentIO.slice(5,6) == (this.input+1));
    this.log(this.currentIO);
}
