const express = require('express');
const passport = require('passport');
const SamlStrategy = require('passport-saml').Strategy;
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken.js');
const getModels = require('../services/getModelService.js');

// Token configuration
const ACCESS_TOKEN_EXPIRY_MINUTES = 1;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_EXPIRY_MINUTES}m`;
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;
const ACCESS_TOKEN_EXPIRY_MS = ACCESS_TOKEN_EXPIRY_MINUTES * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Function to get SAML configuration for a school
async function getSAMLConfig(school, req) {
    try {
        const { SAMLConfig } = getModels(req, 'SAMLConfig');
        const config = await SAMLConfig.findOne({ school, active: true });
        if (!config) {
            throw new Error(`No active SAML configuration found for school: ${school}`);
        }
        
        const passportConfig = config.toPassportSamlConfig();
        
        // Debug certificate information
        console.log('SAML Config Debug:', {
            school: school,
            hasIdpCert: !!passportConfig.cert,
            hasPrivateCert: !!passportConfig.privateCert,
            hasPrivateKey: !!passportConfig.privateKey,
            hasDecryptionKey: !!passportConfig.decryptionPvk,
            idpCertLength: passportConfig.cert?.length || 0,
            privateCertLength: passportConfig.privateCert?.length || 0
        });
        
        return passportConfig;
    } catch (error) {
        console.error('Error getting SAML config:', error);
        throw error;
    }
}

async function createOrUpdateUserFromSAML(profile, school) {
    try {
        const { User } = getModels({ school }, 'User');
        
        //extract user info
        const email = profile['urn:oid:1.3.6.1.4.1.5923.1.1.1.6'] || profile.email || profile.mail;
        const givenName = profile['urn:oid:2.5.4.42'] || profile.givenName || profile.firstName;
        const surname = profile['urn:oid:2.5.4.4'] || profile.sn || profile.lastName;
        const displayName = profile['urn:oid:2.16.840.1.113730.3.1.241'] || profile.displayName;
        const uid = profile['urn:oid:0.9.2342.19200300.100.1.1'] || profile.uid;
        const affiliation = profile['urn:oid:1.3.6.1.4.1.5923.1.1.1.9'] || profile.eduPersonAffiliation;

        if (!email) {
            throw new Error('Email is required for SAML authentication');
        }

        //check if user exists
        let user = await User.findOne({ 
            $or: [
                { email: email },
                { samlId: uid }
            ]
        });

        if (user) {
            //update existing user with SAML information
            user.samlId = uid;
            user.samlProvider = 'rpi';
            user.name = displayName || `${givenName} ${surname}`.trim();
            user.samlAttributes = profile;
            
            //update roles based on affiliation
            if (affiliation && affiliation.includes('faculty')) {
                if (!user.roles.includes('admin')) {
                    user.roles.push('admin');
                }
            }
            
            await user.save();
        } else {
            //create new user
            const username = uid || email.split('@')[0];
            
            user = new User({
                email: email,
                username: username,
                name: displayName || `${givenName} ${surname}`.trim(),
                samlId: uid,
                samlProvider: 'rpi',
                samlAttributes: profile,
                roles: affiliation && affiliation.includes('faculty') ? ['user', 'admin'] : ['user']
            });
            
            await user.save();
        }

        return user;
    } catch (error) {
        console.error('Error creating/updating user from SAML:', error);
        throw error;
    }
}

// Configure Passport SAML strategy
function configureSAMLStrategy(school, req) {
    return new Promise(async (resolve, reject) => {
        try {
            const config = await getSAMLConfig(school, req);
            
            const strategy = new SamlStrategy(config, async (profile, done) => {
                try {
                    const user = await createOrUpdateUserFromSAML(profile, school);
                    return done(null, user);
                } catch (error) {
                    return done(error, null);
                }
            });

            resolve(strategy);
        } catch (error) {
            reject(error);
        }
    });
}

//SAML Login endpoint
router.get('/login', async (req, res) => {
    try {
        const { relayState } = req.query;
        const school = req.school || 'rpi';
        
        console.log(`SAML login initiated for school: ${school}, relayState: ${relayState}`);
        
        const strategy = await configureSAMLStrategy(school, req);
        
        //store relay state in session or pass it through
        if (relayState) {
            req.session = req.session || {};
            req.session.relayState = relayState;
        }
        
        passport.authenticate(strategy, { 
            failureRedirect: '/login',
            failureFlash: true 
        })(req, res);
        
    } catch (error) {
        console.error('SAML login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'SAML authentication not configured for this school' 
        });
    }
});

// SAML Callback endpoint
router.post('/callback', async (req, res) => {
    try {
        const school = req.school || 'rpi';
        const strategy = await configureSAMLStrategy(school, req);
        
        // Debug logging for SAML response
        console.log('SAML callback received for school:', school);
        console.log('SAML response body keys:', Object.keys(req.body));
        
        passport.authenticate(strategy, { 
            failureRedirect: '/login',
            failureFlash: true 
        }, async (err, user) => {
            if (err) {
                console.error('SAML callback error:', err);
                console.error('Error details:', {
                    message: err.message,
                    stack: err.stack,
                    school: school
                });
                return res.redirect('/login?error=saml_authentication_failed');
            }
            
            if (!user) {
                return res.redirect('/login?error=no_user_found');
            }
            
            try {
                //generate tokens
                const accessToken = jwt.sign(
                    { userId: user._id, roles: user.roles }, 
                    process.env.JWT_SECRET, 
                    { expiresIn: ACCESS_TOKEN_EXPIRY }
                );
                
                const refreshToken = jwt.sign(
                    { userId: user._id, type: 'refresh' }, 
                    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
                    { expiresIn: REFRESH_TOKEN_EXPIRY }
                );

                //store refresh token in database
                const { User } = getModels({ school }, 'User');
                await User.findByIdAndUpdate(user._id, { 
                    refreshToken: refreshToken 
                });

                //set cookies
                res.cookie('accessToken', accessToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: ACCESS_TOKEN_EXPIRY_MS,
                    path: '/'
                });

                res.cookie('refreshToken', refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: REFRESH_TOKEN_EXPIRY_MS,
                    path: '/'
                });

                //get relay state for redirect
                const relayState = req.session?.relayState || '/room/none';
                
                //clear session
                if (req.session) {
                    delete req.session.relayState;
                }

                console.log(`SAML authentication successful for user: ${user.email}`);
                
                //redirect to frontend callback page
                const frontendUrl = process.env.NODE_ENV === 'production'
                    ? 'https://study-compass.com'
                    : 'http://localhost:3000';
                
                res.redirect(`${frontendUrl}/auth/saml/callback?relayState=${encodeURIComponent(relayState)}`);
                
            } catch (error) {
                console.error('Error generating tokens:', error);
                res.redirect('/login?error=token_generation_failed');
            }
        })(req, res);
        
    } catch (error) {
        console.error('SAML callback error:', error);
        res.redirect('/login?error=saml_configuration_error');
    }
});

//SAML Logout endpoint
router.post('/logout', verifyToken, async (req, res) => {
    try {
        const school = req.school || 'rpi';
        const config = await getSAMLConfig(school);
        
        //clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        
        //clear refresh token from database
        const { User } = getModels({ school }, 'User');
        await User.findByIdAndUpdate(req.user.userId, { 
            refreshToken: null 
        });
        
        //if SAML logout URL is configured, redirect to it
        if (config.logoutUrl) {
            res.redirect(config.logoutUrl);
        } else {
            res.json({ success: true, message: 'Logged out successfully' });
        }
        
    } catch (error) {
        console.error('SAML logout error:', error);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
});

//SAML Metadata endpoint
router.get('/metadata', async (req, res) => {
    try {
        const school = req.school || 'rpi';
        const config = await getSAMLConfig(school, req);
        
        //helper function to clean certificate
        const cleanCertificate = (cert) => {
            return cert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
        };

        //generate SP metadata
        const metadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${config.issuer}">
    <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing">
            <ds:KeyInfo>
                <ds:X509Data>
                    <ds:X509Certificate>${cleanCertificate(config.signingCert)}</ds:X509Certificate>
                </ds:X509Data>
            </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:KeyDescriptor use="encryption">
            <ds:KeyInfo>
                <ds:X509Data>
                    <ds:X509Certificate>${cleanCertificate(config.encryptCert)}</ds:X509Certificate>
                </ds:X509Data>
            </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${config.callbackUrl}" index="0"/>
        <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${config.logoutUrl || config.callbackUrl.replace('/callback', '/logout')}"/>
        <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
        <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</md:NameIDFormat>
        <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    </md:SPSSODescriptor>
</md:EntityDescriptor>`;
        
        res.set('Content-Type', 'application/xml');
        res.send(metadata);
        
    } catch (error) {
        console.error('SAML metadata error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate metadata' });
    }
});

module.exports = router; 