const mongoose = require('mongoose');

const samlConfigSchema = new mongoose.Schema({
    school: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    // Identity Provider configuration
    idp: {
        entityID: {
            type: String,
            required: true
        },
        singleSignOnService: {
            binding: {
                type: String,
                default: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
            },
            location: {
                type: String,
                required: true
            }
        },
        singleLogoutService: {
            binding: {
                type: String,
                default: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
            },
            location: {
                type: String,
                required: false
            }
        },
        x509Cert: {
            type: String,
            required: true
        }
    },
    // Service Provider configuration
    sp: {
        entityID: {
            type: String,
            required: true
        },
        assertionConsumerService: {
            binding: {
                type: String,
                default: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
            },
            location: {
                type: String,
                required: true
            }
        },
        singleLogoutService: {
            binding: {
                type: String,
                default: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
            },
            location: {
                type: String,
                required: false
            }
        },
        signingCert: {
            type: String,
            required: true
        },
        signingKey: {
            type: String,
            required: true
        },
        encryptCert: {
            type: String,
            required: true
        },
        encryptKey: {
            type: String,
            required: true
        }
    },
    // SAML settings
    settings: {
        authnRequestsSigned: {
            type: Boolean,
            default: true
        },
        wantAssertionsSigned: {
            type: Boolean,
            default: true
        },
        wantMessageSigned: {
            type: Boolean,
            default: true
        },
        wantLogoutRequestSigned: {
            type: Boolean,
            default: true
        },
        wantLogoutResponseSigned: {
            type: Boolean,
            default: true
        },
        isAssertionEncrypted: {
            type: Boolean,
            default: true
        },
        messageSigningOrder: {
            type: String,
            default: 'encrypt-then-sign'
        }
    },
    // Attribute mapping
    attributeMapping: {
        type: Object,
        default: {}
    },
    // Additional settings
    nameIDFormat: {
        type: String,
        default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
    },
    relayState: {
        type: String,
        default: '/room/none'
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

    // Method to convert to Passport SAML configuration
    samlConfigSchema.methods.toPassportSamlConfig = function() {
        return {
            entryPoint: this.idp.singleSignOnService.location,
            issuer: this.sp.entityID,
            callbackUrl: this.sp.assertionConsumerService.location,
            cert: this.idp.x509Cert,
            privateCert: this.sp.signingCert,
            privateKey: this.sp.signingKey,
            decryptionPvk: this.sp.encryptKey,
            signatureAlgorithm: 'sha256',
            acceptedClockSkewMs: 30000, // 30 seconds
            identifierFormat: this.nameIDFormat,
            authnContext: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
            validateInResponseTo: false,
            disableRequestedAuthnContext: true,
            authnRequestsSigned: this.settings.authnRequestsSigned,
            wantAssertionsSigned: this.settings.wantAssertionsSigned,
            wantMessageSigned: this.settings.wantMessageSigned,
            wantLogoutRequestSigned: this.settings.wantLogoutRequestSigned,
            wantLogoutResponseSigned: this.settings.wantLogoutResponseSigned,
            wantNameId: true,
            wantNameIdFormat: true,
            wantAttributeStatement: this.settings.wantAttributeStatement,
            wantAssertionsEncrypted: this.settings.isAssertionEncrypted,
            // wantNameIdEncrypted: false,      // Temporarily disable NameID encryption
            attributeMapping: this.attributeMapping,
            authnRequestBinding: 'HTTP-REDIRECT',
            // Additional fields for metadata generation
            signingCert: this.sp.signingCert,
            encryptCert: this.sp.encryptCert
        };
    };

module.exports = samlConfigSchema; 