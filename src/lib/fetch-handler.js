const ResponseBuilder = require('./response-builder');

const FetchMock = {};

FetchMock.fetchHandler = function (url, opts) {

	// this is used to power the .flush() method
	let done
	this._holdingPromises.push(new this.config.Promise(res => done = res));

	// wrapped in this promise to make sure we respect custom Promise
	// constructors defined by the user
	return new this.config.Promise((res, rej) => {
		try {
			this.negotiateResponse(url, opts)
				.then(res, rej)
				.then(done, done);
		} catch (err) {
			rej(err);
			done();
		}
	})
}

FetchMock.fetchHandler.isMock = true;

FetchMock.negotiateResponse = async function (url, opts) {

	let response = this.router(url, opts);

	if (!response) {
		this.config.warnOnFallback && console.warn(`Unmatched ${opts && opts.method || 'GET'} to ${url}`);
		this.push(null, [url, opts]);

		if (this.fallbackResponse) {
			response = this.fallbackResponse;
		} else {
			throw new Error(`No fallback response defined for ${opts && opts.method || 'GET'} to ${url}`)
		}
	}

	if (typeof response === 'function') {
		response = response(url, opts);
	}

	if (typeof response.then === 'function') {
		// Strange .then is to cope with non ES Promises... god knows why it works
		response = await response.then(it => it)
	}

	// It seems odd to check if response is a function again
	// It's to handle the the need to support making it very easy to add a
	// Promise-based delay to any sort of response (including responses which
	// are defined with a function) while also allowing function responses to
	// return a Promise for a response config.
	if (typeof response === 'function') {
		response = response(url, opts);
	}

	// If the response is a pre-made Response, respond with it
	if (this.config.Response.prototype.isPrototypeOf(response)) {
		return response;
	}

	// If the response says to throw an error, throw it
	if (response.throws) {
		throw response.throws;
	}

	// finally, if we need to convert config into a response, we do it
	return new ResponseBuilder(url, response, this.config, this.statusTextMap)
		.respond();
}


FetchMock.router = function (url, opts) {
	const route = this.routes.find(route => route.matcher(url, opts));

	if (route) {
		this.push(route.name, [url, opts]);
		return route.response;
	}
}

FetchMock.push = function (name, call) {
	if (name) {
		this._calls[name] = this._calls[name] || [];
		this._calls[name].push(call);
		this._matchedCalls.push(call);
	} else {
		this._unmatchedCalls.push(call);
	}
};

module.exports = FetchMock;