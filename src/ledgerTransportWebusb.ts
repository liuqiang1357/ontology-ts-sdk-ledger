import LedgerNode from '@ledgerhq/hw-transport-webusb';
import { LedgerTransport, SendParams } from './ledgerTransport';

/**
 * Standard implementation of Ledger transport using Browser Webusb protocol.
 *
 */
export class LedgerTransportWebusb implements LedgerTransport {
    private delegate: any;

    /**
     * Connects to the Ledger HW and creates transport.
     *
     * Caution: Transport needs to be close before creating new one.
     * Otherwise the new one might fail.
     */
    async open() {
        const supported = await LedgerNode.isSupported();
        if (!supported) {
            throw new Error('Your computer does not support the ledger!');
        }

        this.delegate = await LedgerNode.create();
        this.delegate.setDebugMode(true);
        this.delegate.setScrambleKey('ONT');
    }

    /**
     * Closes the transport connection to the Ledger HW.
     */
    async close() {
        await this.delegate.close();
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
        const resulBuffer: Buffer = await this.delegate.send(
            params.cla,
            params.ins,
            params.p1,
            params.p2,
            Buffer.from(data, 'hex'),
            statusList
        );

        return resulBuffer.toString('hex');
    }
}
