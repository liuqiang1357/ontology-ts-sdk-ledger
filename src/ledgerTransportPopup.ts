import { timeout as timeoutFunc } from 'promise-timeout';
import { v4 as uuid } from 'uuid';
import { LedgerTransport, SendParams } from './ledgerTransport';

declare const chrome: any;

/**
 * Alternative implementation of Ledger communication using popup in extension.
 */
export class LedgerTransportPopup implements LedgerTransport {
    private debug: boolean;
    private channel: MessageChannel;

    /**
     * Creates popup transport
     * @param debug Enable debug messages
     */
    constructor(debug: boolean = false) {
        this.debug = debug;
    }

    /**
     * Connects to the Ledger HW and creates transport.
     *
     * Caution: Transport needs to be close before creating new one.
     * Otherwise the new one might fail.
     */
    async open() {
        const channel = await createChannel(this.debug);

        this.channel = channel;
        await sendToChannel(this.channel, { id: uuid(), method: 'open' });
    }

    /**
     * Closes the transport connection to the Ledger HW.
     */
    async close() {
        await sendToChannel(this.channel, { id: uuid(), method: 'close' });
        await closeChannel(this.channel);
    }

    /**
     * Sends data with params to the Ledger HW.
     *
     * @param params Send Params
     * @param msg - Hex encoded data
     * @param statusList List of valid status codes
     * @return Hex encoded result from Ledger
     */
    async send(params: SendParams, data: string, statusList: number[]): Promise<string> {
        const response = await sendToChannel(this.channel, {
            id: uuid(),
            method: 'send',
            cla: params.cla,
            ins: params.ins,
            p1: params.p1,
            p2: params.p2,
            data,
            statusList
        }, 30000);

        return response.result;
    }
}

export interface ChannelMessage {
    id: string;
}

export interface ChannelResponse extends ChannelMessage {
    result: string;
}

export async function createChannel(debug: boolean) {
    const promise = new Promise<MessageChannel>((resolve, reject) => {
        const popup = chrome.getViews({ type: 'tab' })[0];
        if (popup == null) {
            throw new Error('Popup in not found');
        }

        const channel: MessageChannel = new MessageChannel();

        const ready = (message: any) => {
            if (debug) {
                // tslint:disable-next-line:no-console
                console.log('Received ready message from popup.', message);
            }

            if (message.data === 'ready') {
                channel.port1.removeEventListener('message', ready);
                resolve(channel);
            } else {
                if (debug) {
                    // tslint:disable-next-line:no-console
                    console.error('First event on popup port was not "ready"');
                }
            }
        };
        channel.port1.addEventListener('message', ready);
        channel.port1.start();

        popup.postMessage('init', '*', [channel.port2]);

        return channel;
    });

    return timeoutFunc(promise, 2000);
}

export async function closeChannel(channel: MessageChannel) {
    channel.port1.close();
}

export async function sendToChannel<T extends ChannelMessage>(channel: MessageChannel, msg: T, timeoutMs = 2000) {
    const promise = new Promise<ChannelResponse>((resolve) => {

        const listener = (result: MessageEvent) => {
            const data = result.data as ChannelResponse;

            if (data.id === msg.id) {
                channel.port1.removeEventListener('message', listener);
                resolve(data);
            }
        };

        channel.port1.addEventListener('message', listener);
        channel.port1.postMessage(msg);
    });

    return timeoutFunc(promise, timeoutMs);
}
