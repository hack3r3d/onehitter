const assert = require('assert')
require("dotenv").config({path: '../'})
const OneHitter = require('../onehitter.js')

describe('OneHitter', () => {
    describe('#save', () => {
        it('save-success', async() => {
            console.log(process.env)
            if (process.env.MONGO_DATABASE.search(/test/) < 0) {
                console.error('You can not run these tests on database that does not include "test" in the name.')
                process.exit(1)
            }
            const onehitter = new OneHitter()
            await onehitter.save({name:'123', address: 'xsdf'})
            assert.equal(1, 1)
        })
    })
})
