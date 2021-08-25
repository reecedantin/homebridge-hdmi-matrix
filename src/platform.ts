import { API, DynamicPlatformPlugin, AccessoryPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { TextDecoder } from 'util';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Device } from './devices';

import { MatrixZones } from './accessories/matrix'

require('events').EventEmitter.prototype._maxListeners = 100;


interface Subscription {
    (topic: string, message: string): void
}

interface Message {
    topic: string;
    payload: string;
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class MatrixPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
    public readonly accessories: PlatformAccessory[] = [];
    public subscriptions: Subscription[] = []

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories

            //// TODO: connect to the server here
            this.log.debug("Connected to server")
            // call discoverDevices
            this.discoverDevices()
        });

    }

    sendMessage(topic: string, message: string) {
        this.log.debug("sending command: " + topic + " " + message)
    }


    onMessage(topic, message) {
        this.log.info(topic as string)
        const decoder = new TextDecoder('utf8');
        var payload = decoder.decode(message)
        this.log.info(payload as string)
        for (var i = 0; i < this.subscriptions.length; i++) {
            var sub = this.subscriptions[i];
            sub(topic, payload);
        }
    }


    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        const devices = this.config["devices"] as Device[];

        var registerDevices: PlatformAccessory[] = []

        for (const device of devices) {
            this.log.info(device.type)
            const uuid = this.api.hap.uuid.generate(device.displayName);
            this.log.info('Adding accessory:', device.displayName);

            var accessory = this.accessories.find(accessory => accessory.UUID === uuid);
            var cachedDevice = true
            if (!accessory) {
                accessory = new this.api.platformAccessory(device.displayName, uuid);
                accessory.context.device = device;
                cachedDevice = false
            }

            this.log.info(uuid)

            var foundDevices: AccessoryPlugin[] = []

            switch (device.type) {
                case "MATRIX": {
                    for (var i = 0; i < 8; i++) {
                        new MatrixZones(this, accessory, i)
                    }
                    break;
                }
            }

            if (!cachedDevice && foundDevices.length != 0) {
                registerDevices.push(accessory)
            }
        }

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, registerDevices);
    }
}
