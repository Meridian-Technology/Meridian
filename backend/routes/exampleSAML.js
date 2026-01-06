// MODULES //

const express = require( 'express' );
const fs = require( 'fs' );
const cookieSession = require( 'cookie-session' );
const saml = require( 'samlify' );
const validator = require( '@authenio/samlify-node-xmllint' );
const axios = require( 'axios' );
const bodyParser = require( 'body-parser' );
const debug = require('debug')( 'samlify' );


// VARIABLES //

const ATTRIBUTE_MAP = {
	'email': 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6',
	'cn': 'urn:oid:2.5.4.3',
	'sn': 'urn:oid:2.5.4.4',
	'givenName': 'urn:oid:2.5.4.42',
	'displayName': 'urn:oid:2.16.840.1.113730.3.1.241',
	'uid': 'urn:oid:0.9.2342.19200300.100.1.1',
	'mail': 'urn:oid:0.9.2342.19200300.100.1.3',
	'telephoneNumber': 'urn:oid:2.5.4.20',
	'title': 'urn:oid:2.5.4.12',
	'initials': 'urn:oid:2.5.4.43',
	'description': 'urn:oid:2.5.4.13',
	'carLicense': 'urn:oid:2.16.840.1.113730.3.1.1',
	'departmentNumber': 'urn:oid:2.16.840.1.113730.3.1.2',
	'employeeNumber': 'urn:oid:2.16.840.1.113730.3.1.3',
	'employeeType': 'urn:oid:2.16.840.1.113730.3.1.4',
	'preferredLanguage': 'urn:oid:2.16.840.1.113730.3.1.39',
	'manager': 'urn:oid:0.9.2342.19200300.100.1.10',
	'seeAlso': 'urn:oid:2.5.4.34',
	'facsimileTelephoneNumber': 'urn:oid:2.5.4.23',
	'street': 'urn:oid:2.5.4.9',
	'postOfficeBox': 'urn:oid:2.5.4.18',
	'postalCode': 'urn:oid:2.5.4.17',
	'st': 'urn:oid:2.5.4.8',
	'l': 'urn:oid:2.5.4.7',
	'o': 'urn:oid:2.5.4.10',
	'ou': 'urn:oid:2.5.4.11',
	'businessCategory': 'urn:oid:2.5.4.15',
	'physicalDeliveryOfficeName': 'urn:oid:2.5.4.19',
	'eduPersonAffiliation': 'urn:oid:1.3.6.1.4.1.5923.1.1.1.9'
};
const INVERSE_ATTRIBUTE_MAP = {
	'urn:oid:1.3.6.1.4.1.5923.1.1.1.6': 'email', // eduPersonPrincipalName
	'urn:oid:2.5.4.3': 'cn',
	'urn:oid:2.5.4.4': 'sn',
	'urn:oid:2.5.4.42': 'givenName',
	'urn:oid:2.16.840.1.113730.3.1.241': 'displayName',
	'urn:oid:0.9.2342.19200300.100.1.1': 'uid',
	'urn:oid:0.9.2342.19200300.100.1.3': 'mail',
	'urn:oid:2.5.4.20': 'telephoneNumber',
	'urn:oid:2.5.4.12': 'title',
	'urn:oid:2.5.4.43': 'initials',
	'urn:oid:2.5.4.13': 'description',
	'urn:oid:2.16.840.1.113730.3.1.1': 'carLicense',
	'urn:oid:2.16.840.1.113730.3.1.2': 'departmentNumber',
	'urn:oid:2.16.840.1.113730.3.1.3': 'employeeNumber',
	'urn:oid:2.16.840.1.113730.3.1.4': 'employeeType',
	'urn:oid:2.16.840.1.113730.3.1.39': 'preferredLanguage',
	'urn:oid:0.9.2342.19200300.100.1.10': 'manager',
	'urn:oid:2.5.4.34': 'seeAlso',
	'urn:oid:2.5.4.23': 'facsimileTelephoneNumber',
	'urn:oid:2.5.4.9': 'street',
	'urn:oid:2.5.4.18': 'postOfficeBox',
	'urn:oid:2.5.4.17': 'postalCode',
	'urn:oid:2.5.4.8': 'st',
	'urn:oid:2.5.4.7': 'l',
	'urn:oid:2.5.4.10': 'o',
	'urn:oid:2.5.4.11': 'ou',
	'urn:oid:2.5.4.15': 'businessCategory',
	'urn:oid:2.5.4.19': 'physicalDeliveryOfficeName',
	'urn:oid:1.3.6.1.4.1.5923.1.1.1.9': 'eduPersonAffiliation'
};
const SERVER_URL = 'https://isle-hub.stat.cmu.edu/shibboleth';


// MAIN //

const app = express();
app.use( bodyParser.urlencoded({ 
	extended: true 
}) );
app.use( bodyParser.json() );

app.use( cookieSession({
	name: 'session',
	keys: [ 'my-favorite-secret' ]
}) );

saml.setSchemaValidator( validator );

// URL to the Identity Provider metadata:
const URI_IDP_METADATA = 'https://login.cmu.edu/idp/shibboleth';

axios.get( URI_IDP_METADATA ).then( response => {

	/**
	* Instantiates a SAML identity provider.
	*
	* ## Notes
	*
	* -   Documentation for the configuration object for the `IdentityProvider` can be found [here](https://samlify.js.org/#/idp-configuration)
	*/
	const idp = saml.IdentityProvider({
		metadata: response.data,
		isAssertionEncrypted: true,
		messageSigningOrder: 'encrypt-then-sign',
		wantLogoutRequestSigned: true
	});

	/**
	* Instantiates a SAML service provider.
	*
	* ## Notes
	*
	* -   Documentation for the configuration object for the `ServiceProvider` can be found [here](https://samlify.js.org/#/sp-configuration)
	*/
	const sp = saml.ServiceProvider({
		entityID: 'https://isle-hub.stat.cmu.edu/shibboleth', // SP entity ID
		authnRequestsSigned: false,
		wantAssertionsSigned: false,
		wantMessageSigned: false, 
		wantLogoutResponseSigned: false,
		wantLogoutRequestSigned: false,
		signingCert: fs.readFileSync( '/etc/shibboleth/sp-signing-cert.pem' ),
		// the private key (.pem) use to sign the assertion; 
		privateKey: fs.readFileSync( '/etc/shibboleth/sp-signing-key.pem' ),       
		// the private key pass;
		// privateKeyPass: 'VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px',                     
		// the private key (.pem) use to encrypt the assertion;
		encryptCert: fs.readFileSync( '/etc/shibboleth/sp-encrypt-cert.pem' ),
		encPrivateKey: fs.readFileSync( '/etc/shibboleth/sp-encrypt-key.pem' ),             
		isAssertionEncrypted: true,
		assertionConsumerService: [{
			Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
			Location: 'https://isle-hub.stat.cmu.edu/shibboleth/sp/acs',
		}],
		nameIDFormat: [
			'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
		]
	});

	/**
	* This is the endpoint that the IdP will redirect to after the user logs in.
	* 
	* The IdP will send a SAML response with the user's attributes to this endpoint.
	*/
	app.post('/sp/acs', async ( req, res ) => {
		debug( 'Received /sp/acs post request...' );

		const relayState = req.body.RelayState;
		console.log( 'Relay state: ' );
		console.log( relayState );

		try {
			console.log( 'req.body: ' );
			console.log( req.body );
			const { extract } = await sp.parseLoginResponse( idp, 'post', req );
			console.log( 'Extract: ' );
			console.log( extract );
			req.session.loggedIn = true;
			const attributes = {};
			for ( const key in extract.attributes ) {
				attributes[ INVERSE_ATTRIBUTE_MAP[ key ] ] = extract.attributes[ key ];
			}
			req.session.attributes = attributes;
			console.log( JSON.stringify( attributes ) );
			return res.redirect( relayState || '/' );
		} catch ( e ) {
			console.error( '[FATAL] when parsing login response...', e );
			return res.redirect( '/' );
		}
	});

	/**
	* Endpoint for initiating the login process.
	*/
	app.get( '/login', ( req, res ) => {
		const { id, context } = sp.createLoginRequest( idp, 'redirect' );
		debug( 'Id: %s', id );
		
		const parsedUrl = new URL( context );
		const relayState = req.query.url || SERVER_URL;
		parsedUrl.searchParams.append( 'RelayState', relayState );

		console.log( 'Redirect URL: %s', parsedUrl );
		return res.redirect( parsedUrl );
	});

	/**
	* Endpoint to retrieve the Identity Provider metadata.
	*/ 
	app.get( '/idp/metadata', (req, res) => {
		res.header( 'Content-Type', 'text/xml' ).send( idp.getMetadata() );
	});

	/**
	* Endpoint to retrieve the Service Provider's metadata.
	*/
	app.get( '/sp/metadata', ( req, res ) => {
		res.header( 'Content-Type','text/xml' ).send( sp.getMetadata() );
	});

	app.get( '/*', ( req, res, next ) => {
		if ( !req.session.loggedIn ) {
			return res.redirect( `/shibboleth/login?url=${encodeURI( req.originalUrl )}` );
		}
		next();
	});

	app.get( '/greeting', ( req, res ) => {
		const name = req.session.attributes[ 'givenName' ] || 'Anonymous';
		res.send( `Hello, ${name}!` );
	});

	/**
	* Start the server.
	*/
	app.listen( 8001, () => {
		console.log(`Example app listening at http://localhost:8001`)
	})
});