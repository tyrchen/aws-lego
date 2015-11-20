
const AWS = require('aws-sdk')
const moment = require('moment')
const Promise = require('bluebird')
const Rx = require('rx')
const vorpal = require('vorpal')()

AWS.config.update({region: 'us-west-2'})

const clogs = new AWS.CloudWatchLogs({apiVersion: '2014-03-28'})
Promise.promisifyAll(Object.getPrototypeOf(clogs))

function describeLogGroups(prefix) {
  const params = {}
  if (prefix) {
    params.logGroupNamePrefix = prefix
  }
  return new Promise(function(res, rej) {
    clogs.describeLogGroupsAsync(params)
      .then(data => {
        res(data.logGroups.map(item => item.logGroupName))
      })
      .error(err => rej(err))
  })
}

function describeLogStreams(group, prefix) {
  const params = {
    logGroupName: group,
    descending: true,
    orderBy: 'LastEventTime'
  }
  if (prefix) {
    params.logStreamNamePrefix = prefix
  }
  return clogs.describeLogStreamsAsync(params)
}

function getAllEvents(group, stream) {
  const _getEvents = (observer, token) => {
    const params = {
      logGroupName: group,
      logStreamName: stream,
    }
    if (token) {
      params.nextToken = token
    } else {
      params.startFromHead = true
    }
    clogs.getLogEventsAsync(params)
      .then(data => {
        if (data.nextForwardToken && data.events) {
          _getEvents(observer, data.nextForwardToken)
        }

        if (data.events) {
          observer.onNext(data.events)
        } else {
          observer.onFinished()
        }
      })
      .error(err => {
        observer.onError(err)
      })
  }
  return Rx.Observable.create(observer => {
    _getEvents(observer)
  })
}

vorpal.mode('repl')

vorpal
  .command('show logs <group>', 'Show cloudwatch logs')
  .autocompletion(function(text, iteration, cb) {
    describeLogGroups(text).then(function(data) {
      cb(void 0, data)
    })
  })
  .action(function(args, callback) {
    const group = args.group
    const self = this
    describeLogStreams(group)
      .then(data => {
        if (data.logStreams.length > 0) {
          const source = getAllEvents(group, data.logStreams[0].logStreamName)
          source.subscribe(
            result => {
              result.map(event => {
                self.log(`${moment(event.timestamp).calendar()}: ${event.message}`)
              })
            }
          )
        }
      })
      .error(err => self.log(err))
    callback()
  })

vorpal
  .command('bar', 'A silly bar command')
  .action(function(args, callback) {
    this.log('foo')
    callback()
  })

vorpal.delimiter('aws-lego>').show()
