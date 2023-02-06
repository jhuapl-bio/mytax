import {logger} from './logger.js'

export  class QueueClass { 
	constructor() {
		this._queue = [];
		this.concurrency =  1		
	}

	enqueue(run, options) {
		console.log("runenqueu", run, options)
		run.kill()
		this._queue.push(run);
	}
	 

	dequeue() {
		return this._queue.shift();
	}
	prioritize(run, options) {
		logger.info(`options ${options}`)
		console.log(run)
		return this._queue.unshift(run)
	}

	get size() {
		return this._queue.length;
	}

	filter(options) {
		return this._queue;
	}
}

