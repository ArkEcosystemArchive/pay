'use strict'

const axios = require('axios')
const Emittery = require('emittery')
const get = require('lodash.get')
const interval = require('interval-promise')
const sample = require('lodash.sample')
const uuidv1 = require('uuid/v1')

module.exports = class ArkPay extends Emittery {
    /**
     * Create a new ArkPay instance.
     */
    constructor () {
        super()

        this.reset()
    }

    /**
     * Reset the current transfer session.
     * @return {void}
     */
    reset () {
      this.data = {
        transfer: {
          vendorField: uuidv1(),
          currency: 'USD',
          amounts: {}
        },
        network: {
          name: 'devnet',
          coin: 'ARK',
          peers: []
        },
        seeds: {
          ark: {
            mainnet: 'https://raw.githubusercontent.com/ArkEcosystem/peers/master/mainnet.json',
            devnet: 'https://raw.githubusercontent.com/ArkEcosystem/peers/master/devnet.json'
          }
        }
      }
    }

    /**
     * Set the recipient of the transfer.
     * @param  {String} value
     * @return {ArkPay}
     */
    recipient (value) {
        this.data.transfer.recipient = value

        return this
    }

    /**
     * Set the total amount of the transfer.
     * @param  {Number} value
     * @return {ArkPay}
     */
    amount (value) {
        this.data.transfer.amounts.fiat = value

        return this
    }

    /**
     * Set the vendor field of the transfer.
     * @param  {String} value
     * @return {ArkPay}
     */
    vendorField (value) {
        this.data.transfer.vendorField = value

        return this
    }

    /**
     * Set the fiat currency of the transfer.
     * @param  {String} value
     * @return {ArkPay}
     */
    currency (value) {
        this.data.transfer.currency = value

        return this
    }

    /**
     * Set the crypto currency of the transfer.
     * @param  {String} value
     * @return {ArkPay}
     */
    coin (value) {
        this.data.network.coin = value

        return this
    }

    /**
     * Set the network of the transfer.
     * @param  {String} value
     * @return {ArkPay}
     */
    network (value) {
        this.data.network.name = value

        return this
    }

    /**
     * Set the seeds of the network.
     * @param  {String} key
     * @param  {Array} value
     * @return {ArkPay}
     */
    seeds (key, value) {
      this.data.seeds[key] = value.map(peer => peer.ip)

      return this
    }

    /**
     * Set the peers of the network.
     * @param  {Array|String} value
     * @return {ArkPay}
     */
    peers (value) {
      if (!Array.isArray(value)) {
        throw new Error('The given value is not an array.')
      }

      this.data.network.peers = value.map(peer => peer.ip)

      return this
    }

    /**
     * Return the object representation of the session.
     * @return {Object}
     */
    toObject () {
      return this.data
    }

    /**
     * Prepare a new transfer session.
     * @return {void}
     */
    async prepare () {
      await this.__fetchSeeds()
      await this.__fetchPeers()
      await this.__fetchRates()

      return this
    }

    /**
     * Start a new transfer session.
     * @return {void}
     */
    async start () {
      try {
        interval(async (iteration, stop) => {
          const transaction = await this.__fetchTransfer()

          if (transaction) {
            this.emit('completed', transaction)

            stop()
          }
        }, 1000)

        this.emit('started', this.data)
      } catch (e) {
        this.emit('error', e)
      }
    }

    /**
     * Fetch a list of seeds.
     * @return {void}
     */
    async __fetchSeeds () {
      if (this.data.network.peers.length) {
        return
      }

      try {
        const remoteSource = get(this.data.seeds, `${this.data.network.coin.toLowerCase()}.${this.data.network.name.toLowerCase()}`)
        const { data } = await axios.get(remoteSource)

        this.data.network.peers = data.map(peer => peer.ip)
      } catch (e) {
        this.emit('error', e)
      }
    }

    /**
     * Fetch a list of peers.
     * @return {void}
     */
    async __fetchPeers () {
      if (!this.data.network.peers.length) {
        return
      }

      try {
        const peer = sample(this.data.network.peers)
        const { data } = await axios.get(`http://${peer}:4003/api/v2/peers`)

        this.data.network.peers = data.data
          .filter(peer => peer.latency <= 100)
          .map(peer => peer.ip)
      } catch (e) {
        this.emit('error', e)
      }
    }

    /**
     * Fetch the current exchange rate.
     * @return {void}
     */
    async __fetchRates () {
      try {
        const { data } = await axios.get('https://min-api.cryptocompare.com/data/histoday', {
          params: {
            fsym: this.data.transfer.currency,
            tsym: this.data.network.coin.toUpperCase(),
            limit: 1
          }
        })

        this.data.transfer.exchangeRate = data.Data[0].low
        this.data.transfer.amounts.crypto = this.data.transfer.amounts.fiat * this.data.transfer.exchangeRate
      } catch (e) {
        this.emit('error', e)
      }
    }

    /**
     * Fetch a transaction
     * @return {void}
     */
    async __fetchTransfer () {
      const peer = sample(this.data.network.peers)

      const matchesExpected = transaction => {
        return transaction.amount === (this.data.transfer.amounts.crypto * Math.pow(10, 8)) &&
          transaction.recipient === this.data.transfer.recipient &&
          transaction.vendorField === this.data.transfer.vendorField
      }

      try {
        const { data } = await axios.get(`http://${peer}:4003/api/v2/wallets/${this.data.transfer.recipient}/transactions/received`)

        for (const transaction of data.data) {
          if (matchesExpected(transaction)) {
            return transaction
          }
        }
      } catch (e) {
        this.emit('error', e)
      }

      return false
    }
}
