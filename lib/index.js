'use strict'

const axios = require('axios')
const BigNumber = require('bignumber.js')
const Emittery = require('emittery')
const interval = require('interval-promise')
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
        started: false,
        fetchPeers: true,
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

      this.data.network.peers = value.map(this.__mapPeer)
      this.data.fetchPeers = false

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
     * Start a new transfer session.
     * @return {void}
     */
    async start () {
      await this.__fetchSeeds()
      await this.__fetchPeers()
      await this.__fetchRates()
      await this.__mountListener()
    }

    /**
     * Mount the transaction listener.
     * @return {void}
     */
    async __mountListener () {
      try {
        this.started = true

        interval(async (iteration, stop) => {
          if (!this.started) {
            stop()
          }

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
     * @param {Number} attempts
     * @return {void}
     */
    async __fetchSeeds (attempts = 0) {
      if (this.data.network.peers.length >= 1) {
        return
      }

      if (attempts >= 5) {
        return this.__abort('Failed to find any seeds.')
      }

      try {
        const networkName = this.data.network.name.toLowerCase()
        const networkCoin = this.data.network.coin.toLowerCase()

        const remoteSource = this.data.seeds[networkCoin][networkName]
        const { data } = await this.__get(remoteSource)

        this.data.network.peers = data.map(this.__mapPeer)
      } catch (e) {
        this.emit('error', e)

        attempts++

        this.__fetchSeeds(attempts)
      }
    }

    /**
     * Fetch a list of peers.
     * @param {Number} attempts
     * @return {void}
     */
    async __fetchPeers (attempts = 0) {
      if (!this.data.fetchPeers) {
        return
      }

      if (this.data.network.peers.length <= 0) {
        return
      }

      if (attempts >= 5) {
        return this.__abort('Failed to find any peers.')
      }

      try {
        const peer = this.__buildPeerURL(this.__getRandomPeer())
        const { data } = await this.__get(`${peer}/api/v2/peers`)

        this.data.network.peers = data.data
          .filter(peer => peer.latency <= 100)
          .map(this.__mapPeer)
      } catch (e) {
        this.emit('error', e)

        attempts++

        this.__fetchPeers(attempts)
      }
    }

    /**
     * Fetch the current exchange rate.
     * @param {Number} attempts
     * @return {void}
     */
    async __fetchRates (attempts = 0) {
      if (attempts >= 5) {
        return this.__abort('Failed to find any exchange rates.')
      }

      try {
        const { data } = await this.__get('https://min-api.cryptocompare.com/data/histoday', {
          fsym: this.data.transfer.currency,
          tsym: this.data.network.coin.toUpperCase(),
          limit: 1
        })

        this.data.transfer.exchangeRate = data.Data[0].low
        this.data.transfer.amounts.crypto = this.data.transfer.exchangeRate / this.data.transfer.amounts.fiat
      } catch (e) {
        this.emit('error', e)

        attempts++

        this.__fetchRates(attempts)
      }
    }

    /**
     * Fetch a transaction
     * @return {void}
     */
    async __fetchTransfer () {
      const expectedCrypto = (new BigNumber(this.data.transfer.amounts.crypto)).times(1e8).toFixed(0);

      const matchesExpected = transaction => {
        return transaction.amount === +expectedCrypto &&
          transaction.recipient === this.data.transfer.recipient &&
          transaction.vendorField === this.data.transfer.vendorField
      }

      try {
        const peer = this.__buildPeerURL(this.__getRandomPeer())
        const { data } = await this.__get(`${peer}/api/v2/wallets/${this.data.transfer.recipient}/transactions/received`)

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

    /**
     * Get a random peer.
     * @return {String}
     */
    __getRandomPeer () {
      const peers = this.data.network.peers

      return peers[Math.floor(Math.random() * peers.length)]
    }

    /**
     * Abort the transfer session.
     * @return {Promise}
     */
    async __abort (message) {
      this.reset()

      return this.emit('aborted', message)
    }

    /**
     * Send an HTTP GET request.
     * @return {Promise}
     */
    async __get (url, params = {}) {
      return axios.get(url, {
        params,
        headers: {
          'Accept': 'application/vnd.ark.core-api.v2+json'
        }
      })
    }

    /**
     * Turn a peer object into a unified format.
     */
    __mapPeer (peer) {
      const entity = {
        ip: peer.ip,
        port: peer.port || 4003,
        protocol: peer.protocol || 'http',
      }

      if (![4003, 8443].includes(entity.port)) {
        entity.port = 4003
      }

      return entity
    }

    /**
     * Turn a peer object into a URI.
     */
    __buildPeerURL (peer) {
      return `${peer.protocol}://${peer.ip}:${peer.port}`
    }
}
