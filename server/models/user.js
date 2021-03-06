const mongoose = require('mongoose');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const bcrypt = require('bcryptjs');

/**
 * Mongoose Schema for users
 *  - email -> unique validated email
 *  - password -> encoded password
 *  - tokens -> array with token properties
 *    - access -> access type of the token
 *    - token -> hashed token of user based on his _id and access
 * @type {mongoose}
 */
var UserSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		minlength: 3,
		trim: true,
		unique: true,
		validate: {
			validator: validator.isEmail,
			message: '{VALUE} is not a valid email'
		}
	},
	password: {
		type: String,
		required: true,
		minlength: 6
	},
	tokens: [{
		access: {
			type: String,
			required: true
		},
		token: {
			type: String,
			required: true
		}
	}]
});

/**
 * Override toJSON method of User instance.
 * This is a security function, preventing us from returning
 * bad properties, like user hashed password.
 * @return {[Array]} Array with only _id and email properties of userObject
 */
UserSchema.methods.toJSON = function() {
	var user = this;
	var userObject = user.toObject();

	return _.pick(userObject, ['_id', 'email']);
};

/**
 * New method for User instance.
 * This generates an unique auth token for a given user,
 * using its _id property, and saltifying it with a secret
 * so that no one can re-gen the token with other _id.
 * @return {Promise} Promise that saves the user's token.
 */
UserSchema.methods.generateAuthToken = function() {
	var user = this;
	var access = 'auth';
	var token = jwt.sign({_id: user._id.toHexString(), access}, process.env.JWT_SECRET);

	user.tokens.push({
		access,
		token
	});

	// return promise to allow server.js to chain into it
	return user.save().then(() => {
		return token;
	});
};

UserSchema.methods.removeToken = function(token) {
	var user = this;

	return user.update({
		$pull: {
			tokens: {token}
		}
	});
};

/**
 * Finds an user with the given token, verifying that
 * the token is authentic with jwt.verify and then
 * querying for the user in the database.
 * @param  {String} token JWT generated token
 * @return {Promise}      A reject Promise if token is not authentic or a findOne Promise with a possible user
 */
UserSchema.statics.findByToken = function(token) {
	var User = this; // user model
	var decoded;

	try {
		decoded = jwt.verify(token, process.env.JWT_SECRET);
	} catch (err) {
		// return new Promise((resolve, reject) => {
		//   reject();
		// });
		// code below does same thing
		return Promise.reject();
	}

	return User.findOne({
		'_id': decoded._id,
		'tokens.token': token,
		'tokens.access': 'auth'
	});
};

/**
 * Finds a user with the given credentials, verifying that
 * the user with that email exists, and then comparing the
 * given password with the hashed password stored in the
 * database using bcrypt.
 * @param  {String} email    The user email to query
 * @param  {String} password The user password to compare
 * @return {Promise} A Promise with the user found. If user is not found or password is not correct it returns a reject Promise.
 */
UserSchema.statics.findByCredentials = function(email, password) {
	var User = this;

	return User.findOne({email}).then((user) => {
		if(!user) {
			return Promise.reject();
		}

		return new Promise((resolve, reject) => {
			bcrypt.compare(password, user.password, (err, res) => {
				if(res) {
					resolve(user);
				} else {
					reject();
				}
			});
		});
	});
};

/**
 * Function executed before save() runs.
 * This will generate a hash password for the user
 * and then will set it to the password field so
 * the hashed pass is saved
 * @param  {Function} next The next function assures the process keep running
 * @return {[undefined]}   Nothing is returned
 */
UserSchema.pre('save', function (next) {
	var user = this;

	if(user.isModified('password')) {
		var passToHash = user.password;

		bcrypt.genSalt(10, (err, salt) => {
			bcrypt.hash(passToHash, salt, (err, hash) => {
				if(!err) {
					user.password = hash;
					next();
				} else {
					next('Error generating hash');
				}
			});
		});

	} else {
		next();
	}
});

let User = mongoose.model('User', UserSchema);

module.exports = {User};
