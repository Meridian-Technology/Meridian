#!/usr/bin/env node

const mongoose = require('mongoose');
const samlConfigSchema = require('./schemas/samlConfig');

async function checkConfig() {
    try {
        await mongoose.connect(process.env.MONGO_URL_LOCAL || 'mongodb://localhost:27017/studycompass');
        console.log('✅ Connected to database');
        
        const SAMLConfig = mongoose.model('SAMLConfig', samlConfigSchema, 'samlConfigs');
        const config = await SAMLConfig.findOne({ school: 'rpi' });
        
        if (!config) {
            console.log('❌ No RPI config found');
            return;
        }
        
        console.log('RPI Config Certificate Check:');
        console.log('Has encryptCert:', !!config.sp.encryptCert);
        console.log('Has x509Cert:', !!config.sp.x509Cert);
        console.log('Has signingCert:', !!config.sp.signingCert);
        console.log('Has signingPrivateKey:', !!config.sp.signingPrivateKey);
        console.log('Has encryptPrivateKey:', !!config.sp.encryptPrivateKey);
        console.log('Has privateKey:', !!config.sp.privateKey);
        
        // Test the toPassportSamlConfig method
        console.log('\nPassport-saml Config:');
        const passportConfig = config.toPassportSamlConfig();
        console.log('Has decryptionCert:', !!passportConfig.decryptionCert);
        console.log('Has privateCert:', !!passportConfig.privateCert);
        console.log('Has decryptionPvk:', !!passportConfig.decryptionPvk);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

checkConfig(); 