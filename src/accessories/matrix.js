const PLUGIN_NAME = 'homebridge-matrix';

export class MatrixZones {

    constructor(platform, accessory, index) {
        this.log = platform.log;
        this.config = accessory.context.device;
        this.api = platform.api;
        this.accessory = accessory

        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;

        // extract name from config
        this.name = this.config.outputs[index];

        this.number = index + 1

        if (this.name == "") {
            return
        }

        this.currentState = {
            CurrentInput: 1,
        }

        this.callbacks = []

        // get the name
        const tvName = this.name || 'Example TV';

        // generate a UUID
        const uuid = this.api.hap.uuid.generate('homebridge:matrix' + tvName);

        // create the accessory
        this.tvAccessory = new this.api.platformAccessory(tvName, uuid);

        // set the accessory category
        this.tvAccessory.category = this.api.hap.Categories.TELEVISION;

        // add the tv service
        this.tvService = this.tvAccessory.addService(this.Service.Television);

        // set the tv name
        this.tvService.setCharacteristic(this.Characteristic.ConfiguredName, tvName);

        // set sleep discovery characteristic
        this.tvService.setCharacteristic(this.Characteristic.SleepDiscoveryMode, this.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        // handle on / off events using the Active characteristic
        this.tvService.getCharacteristic(this.Characteristic.Active)
            .on('set', (newValue, callback) => {
                this.log.info('set Active => setNewValue: ' + newValue);
                this.tvService.updateCharacteristic(this.Characteristic.Active, true);
                callback(null);
            })
            .on('get', (callback) => {
                callback(null, true);
            })

        this.tvService.setCharacteristic(this.Characteristic.ActiveIdentifier, 1);

        // handle input source changes
        this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier)
            .on('set', (newValue, callback) => {

                // the value will be the value you set for the Identifier Characteristic
                // on the Input Source service that was selected - see input sources below.

                this.log.info('set Active Identifier => setNewValue: ' + newValue);
                this.currentState.CurrentInput = newValue

                var intValue = parseInt(newValue)
                var setValue = intValue + 1

                this.sendMessage("matrix/" + this.number + "/INPUT", "" + setValue)
                callback(null);
            })
        // .on('get', (callback) => {
        //
        //     // the value will be the value you set for the Identifier Characteristic
        //     // on the Input Source service that was selected - see input sources below.
        //
        //     this.log.info('get Active Identifier');
        //     callback(null, this.currentState.CurrentInput);
        // });


        /**
         * Create TV Input Source Services
         * These are the inputs the user can select from.
         * When a user selected an input the corresponding Identifier Characteristic
         * is sent to the TV Service ActiveIdentifier Characteristic handler.
         */

        for (var i = 0; i < this.config.inputs.length; i++) {

            var inputName = this.config["inputs"][i]
            var configured = this.Characteristic.IsConfigured.CONFIGURED
            if (inputName == "") {
                inputName = "input" + i
                configured = this.Characteristic.IsConfigured.NOT_CONFIGURED
            }

            var inputService = this.tvAccessory.addService(this.Service.InputSource, inputName, inputName);
            inputService
                .setCharacteristic(this.Characteristic.Identifier, i)
                .setCharacteristic(this.Characteristic.ConfiguredName, inputName)
                .setCharacteristic(this.Characteristic.IsConfigured, configured)
                .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.HDMI);
            this.tvService.addLinkedService(inputService); // link to tv service
        }

        /**
         * Publish as external accessory
         * Only one TV can exist per bridge, to bypass this limitation, you should
         * publish your TV as an external accessory.
         */


        this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);

        this.sendMessage = platform.sendMessage.bind(platform)
        platform.subscriptions.push(this.onMessage.bind(this))
    }

    onMessage(topic, payload) {
        if (topic.startsWith("matrix/" + this.number)) {
            this.log.debug(`Publish received on topic ${topic}`);

            for (var i = 0; i < this.callbacks.length; i++) {
                this.callbacks[i](null)
            }
            this.callbacks = []

            this.log.debug(payload)
            const message = JSON.parse(payload);
            this.log.debug(message);

            if (message["INPUT"] != null) {
                this.currentState.CurrentInput = parseInt(message["INPUT"]) - 1
            }

            // if (message["POWER"] != null) {
            //     if (message["POWER"] == true) {
            //         this.currentState.Active = this.Characteristic.Active.ACTIVE
            //     } else {
            //         this.currentState.Active = this.Characteristic.Active.INACTIVE
            //     }
            // }

            // if (message["MUTE"] != null) {
            //     if (message["MUTE"] == true) {
            //         this.currentState.CurrentVolume = 0
            //     }
            // }

            this.tvService.updateCharacteristic(this.Characteristic.ActiveIdentifier, this.currentState.CurrentInput)
        }
    }

    getServices() {
        return [];
    }
}
