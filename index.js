const crypto = require('crypto');
const _ = require("lodash");
const axios = require('axios');

const STATES = [
  'Transaction expected',
  'The transaction is waiting for the required number of confirmations',
  'Currency exchange',
  'Sending funds',
  'Completed',
  'Expired',
  'Not currently in use',
  'A decision must be made to proceed with the order'
];

class FixedFloat {
  /**
   * Main API class
   * @param {String} apiKey API key
   * @param {String} secretKey Secret key
   * @param {{refcode, afftax}} affiliate reference code.
   * @description Get your pair of keys from https://fixedfloat.com/apikey
   */
  constructor(apiKey, secretKey, affiliate = undefined) {
    if (!apiKey || !secretKey) throw new Error('Please provide an API and secret keys');
    this._client = axios.create({
      baseURL: 'https://fixedfloat.com/api/v2/',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-API-KEY': apiKey
      }
    })
    this._client.interceptors.request.use((config) => {
      const bodyStr = _.isEmpty(config.data) ? '' : new URLSearchParams(config.data).toString();
      _.set(
        config.headers,
        'X-API-SIGN',
        crypto.createHmac('sha256', Buffer.from(secretKey))
          .update(bodyStr)
          .digest('hex')
      );
      return config
    });
    this._client.interceptors.response.use((resp) => {
      const data = _.get(resp, 'data.data');
      const {status, msg, code} = data;
      if (code !== 0 || msg !== 'OK') {
        throw new Error(`Error ${code}: ${msg}`);
      }
      if (!_.isEmpty(status)) {
        _.set(resp, 'data.data.statusText', STATES[status]);
      }
      return resp;
    });

    if (affiliate !== undefined) {
      this.refcode = affiliate.refcode;
      this.afftax = affiliate.afftax;
    }
  }

  _splitCcy(ccyData) {
    if (!_.includes(ccyData, ' ')) {
      return {ccy: ccyData};
    }
    const [amount, ccy] = _.split(ccyData, ' ', 2);
    return {amount, ccy};
  }

  _calcAmtAndDir(fromAmt, toAmt) {
    if (!_.isEmpty(fromAmt)) {
      return {amount: fromAmt, direction: 'from'};
    }
    if (!_.isEmpty(toAmt)) {
      return {amount: toAmt, direction: 'to'};
    }
    return {};
  }

  /**
   * Getting a list of all currencies that are available on FixedFloat.com.
   */
  async getCurrencies() {
    const {data} = await this._client.post('/ccies');
    return data;
  }

  /**
   * Information about a currency pair with a set amount of funds.
   * @param {String} from From currency (ex. 0.1 ETH)
   * @param {String} to To currency (ex. BTC)
   * @param {'fixed'|'float'} type Order type: fixed or float (def. float)
   */
  async getPrice(from, to, type = 'float') {
    if (!from || !to || from.indexOf(' ') + to.indexOf(' ') === -2) {
      throw new Error(`No required params. Example: {from: '0.1 ETH', to: 'BTC'}`);
    }

    const {ccy: fromCcy, amount: fromAmt} = this._splitCcy(from);
    const {ccy: toCcy, amount: toAmt} = this._splitCcy(to);
    const {amount, direction} = this._calcAmtAndDir(fromAmt, toAmt);

    const {data} = await this._client.post(
      '/price',
      _.omitBy({
        type,
        fromCcy, toCcy,
        amount, direction,
        refcode: this.refcode,
        afftax: this.afftax,
      })
    );
    return data;
  }

  /**
   * Receiving information about the order.
   * @param {String} id Order ID
   * @param {String} token Security token of order
   */
  async getOrder(id, token) {
    const {data} = await this._client.post('/order', {id, token});
    return data
  }

  /**
   * Emergency Action Choice
   * @param {String} id Order ID
   * @param {String} token Security token of order
   * @param {String} choice EXCHANGE or REFUND
   * @param {String} address refund address, required if choice="REFUND"
   */
  async setEmergency(id, token, choice, address) {
    const {data} = await this._client.post('/emergency', {id, token, choice, address});
    return data;
  }

  /**
   * Creating exchange orders.
   * @param {String} from From currency (ex. 0.1 ETH)
   * @param {String} to To currency (ex. BTC)
   * @param {String} toAddress A destination address to which the funds will be dispatched upon the successful completion of the Order
   * @param {'fixed'|'float'} type Order type: fixed or float (def. float)
   * @param {String} tag This parameter can be omitted by specifying the MEMO or Destination Tag in toAddress separated by a colon.
   */
  async createOrder(from, to, toAddress, type = 'float', tag) {
    if (!from || !to || from.indexOf(' ') + to.indexOf(' ') === -2) {
      throw new Error(`No required params. Example: {from: '0.1 ETH', to: 'BTC', ...}`);
    }

    const {ccy: fromCcy, amount: fromAmt} = this._splitCcy(from);
    const {ccy: toCcy, amount: toAmt} = this._splitCcy(to);
    const {amount, direction} = this._calcAmtAndDir(fromAmt, toAmt);

    const {data} = await this._client.post(
      '/create',
      _.omitBy({
        type, tag,
        fromCcy, toCcy,
        amount, direction,
        refcode: this.refcode,
        afftax: this.afftax,
      }, _.identity)
    );

    return data;
  }
}

module.exports = FixedFloat;
