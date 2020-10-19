import { timeout as timeoutFunc } from 'promise-timeout';
import { v4 as uuid } from 'uuid';
import { LedgerTransport, SendParams } from './ledgerTransport';

interface ChannelMessage {
    id: string;
    method: string;
}

interface ChannelSendParams extends ChannelMessage {
    params: SendParams;
    data: string;
    statusList: number[];
}

interface ChannelResponse extends ChannelMessage {
    id: string;
    result?: string;
    error?: string;
}

type SendMessage = (msg: ChannelMessage) => Promise<ChannelResponse>;
type OnMessage = (msg: ChannelMessage) => Promise<ChannelResponse>;
type Cleanup = () => void;
type SetupOnMessage = (onMessage: OnMessage) => Cleanup;

/**
 * Alternative implementation of Ledger communication using forwarder and provider.
 */
export class LedgerTransportForwarder implements LedgerTransport {
    private sendMessage: SendMessage;

    /**
     * Creates transport forwarder
     */
    constructor(sendMessage: SendMessage) {
        this.sendMessage = sendMessage;
    }

    /**
     * Connects to the Ledger HW and creates transport.
     */
    async open() {
        await this.sendToProvider({ id: uuid(), method: 'ledger.open' });
    }

    /**
     * Closes the transport connection to the Ledger HW.
     */
    async close() {
        await this.sendToProvider({ id: uuid(), method: 'ledger.close' });
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
        return this.sendToProvider({
            id: uuid(),
            method: 'ledger.send',
            params,
            data,
            statusList
        } as ChannelSendParams);
    }

    private async sendToProvider<T extends ChannelMessage>(msg: T, timeoutMs = 30000) {
        return timeoutFunc((async () => {
            const response = await this.sendMessage(msg);
            if (response.error) {
                throw new Error(response.error);
            }
            return response.result!;
        })(), timeoutMs);
    }
}

export class LedgerTransportProvider {
    private transport: LedgerTransport;
    private setupOnMessage: SetupOnMessage;
    private cleanup?: Cleanup;

    constructor(transport: LedgerTransport, setupOnMessage: SetupOnMessage) {
        this.transport = transport;
        this.setupOnMessage = setupOnMessage;
    }

    start() {
        this.cleanup = this.setupOnMessage(this.onMessage.bind(this));
    }

    stop() {
        if (this.cleanup) {
            this.cleanup();
        }
    }

    private async onMessage(msg: ChannelMessage) {
        let result;
        let error;
        try {
            if (msg) {
                if (msg.method === 'ledger.open') {
                    result = await this.transport.open();
                } else if (msg.method === 'ledger.close') {
                    result = await this.transport.close();
                } else if (msg.method === 'ledger.send') {
                    const params = msg as ChannelSendParams;
                    result = await this.transport.send(
                        params.params,
                        params.data,
                        params.statusList
                    );
                }
            }
        } catch (e) {
            error = e.message;
        }
        return { id: msg.id, result, error } as ChannelResponse;
    }
}
