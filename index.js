'use strict'

const ArkPay = require('./lib')

const init = async () => {
    const gateway = new ArkPay()
    gateway
        .recipient('DNjuJEDQkhrJ7cA9FZ2iVXt5anYiM8Jtc9')
        .amount(1)
        .vendorField('thisisarandomtestingvendorfieldwhatever')
        .currency('USD')
        .coin('ARK')
        .network('devnet')

    gateway.on('started', data => {
        console.log('A session has started.')
    })

    gateway.on('aborted', data => {
        console.log('A session has aborted.')
        console.log(data)
    })

    gateway.on('completed', data => {
        console.log('A session has completed.')
        console.log(data)
    })

    gateway.on('expired', data => {
        console.log('A session has expired.')
        console.log(data)
    })

    gateway.on('error', data => {
        console.log('A session has errored.')
        console.log(data)
    })

    await gateway.prepare()
    await gateway.start()
}

init()
