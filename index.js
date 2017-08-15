//HDMI PLATFORM

var net = require("net");
var Service, Characteristic, Accessory, uuid;
var inherits = require('util').inherits;
var extend = require('util')._extend;

var firstcurrentIO = ["o01i01", "o02i01", "o03i01", "o04i01", "o05i01", "o06i01", "o07i01", "o08i01"];
var clients = [];
var clientsCurrentIO = [];


/* Register the plugin with homebridge */
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;
    uuid = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-hdmi-matrix", "HDMIMatrix", MatrixPlatform);
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

            //clientsCurrentIO.push(firstcurrentIO);
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
            //     callback([]);
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
                                    results.push(new MatrixOutput(this.log, i, currentIO.length, currentDeviceConfig, currentIO[i], client));
                                    devicesProcessed++;
                                }
                            }
                            if (results.length === 0)
                            {
                                  this.log("WARNING: No Accessories were loaded.");
                            }
                            callback(results)
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
    } else {
        this.log("Error parsing config file");
    }
}

function MatrixOutput(log, output, numInputs, config, io, client) {
    this.log = log;
    this.name = config.outputs[output];
    this.inputs = []
    this.services = []
    this.client = client

    this.log("Configuring matrix output: " + config.outputs[output]);

    for(var i = 0; i < numInputs; i++){
        if (config.inputs[i] !== "") {
            this.addInput(new MatrixInput(log, config.inputs[i] + " " + config.outputs[output], output, i, io, client))
        }
    }

    var informationService = new Service.AccessoryInformation();
    informationService
    .setCharacteristic(Characteristic.Manufacturer, 'HDMI-Matrix')
    .setCharacteristic(Characteristic.Model, config.outputs[output])
    .setCharacteristic(Characteristic.SerialNumber, config.outputs[output]);

    this.services.push(informationService);

    this.output = output;
    this.numInputs = numInputs;

    this.client.on('data', function (data) {
        var response = data.toString('utf-8').trim();
        var checkready = response.split("\n");

        if (checkready.length == 2) {
            if (checkready[0].slice(2,3) == this.output+1) {
                var checkInput = checkready[0].slice(5,6) - 1;
                for(var i = 0; i < this.inputs.length; i++){
                    if(checkInput == i) {
                        this.log("Recieved command: " + this.inputs[i].name);
                        this.inputs[i].setSelfState(true)
                    } else {
                        this.inputs[i].setSelfState(false)
                    }
                }
            }
        }
    }.bind(this));

    this.client.on('close', function () {
        this.log("Connection lost to " + this.name);
    }.bind(this));
}

MatrixOutput.prototype.addInput = function (newInput) {
    this.inputs.push(newInput);
    this.services.push(newInput.getService());
}

MatrixOutput.prototype.getServices = function () {
    this.log(this.name + " getServices")
    return this.services
}


function MatrixInput(log, name, output, input, io, client) {
    this.name = name;
    this.input = input;
    this.output = output;
    this.log = log;
    this.client = client;

    this.service = new Service.Switch(this.name);
    this.service.subtype = "output" + (output + 1) + "input"+(input+1);
    this.service
        .getCharacteristic(Characteristic.On)
        .on('set', this.setState.bind(this))
        .on('get', this.getState.bind(this));

    this.currentIO = io
    if (this.currentIO.slice(5,6) == (this.input+1)) {
      this.setSelfState(true)
    } else {
      this.setSelfState(false)
    }
    this.log(this.name);
}

MatrixInput.prototype.getService = function() {
    this.log(this.name + " getService");
    return this.service;
}

MatrixInput.prototype.getState = function (callback) {
    callback(null, this.currentIO.slice(5,6) == (this.input+1));
}


MatrixInput.prototype.setState = function (state, callback) {
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
    this.log(command)
    callback(null);
}

MatrixInput.prototype.setSelfState = function (state) {
    this.selfSet = true;
    this.service
      .getCharacteristic(Characteristic.On)
      .setValue(state);
}
