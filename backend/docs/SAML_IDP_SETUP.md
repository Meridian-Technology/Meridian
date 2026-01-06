# SAML Identity Provider (IdP) Configuration Guide

This document contains all the information needed by your Identity Provider (IdP) team to configure SAML authentication for Study Compass.

## Service Provider (SP) Information

### Entity ID
```
https://rpi.study-compass.com/auth/saml/metadata
```

### Assertion Consumer Service (ACS) URL
```
https://rpi.study-compass.com/auth/saml/callback
```
- **Binding**: HTTP-POST
- **Index**: 0

### Single Logout Service (SLO) URL
```
https://rpi.study-compass.com/auth/saml/logout
```
- **Binding**: HTTP-Redirect

### Service Provider Certificates (X.509)

**Signing Certificate (PEM format):**
```
-----BEGIN CERTIFICATE-----
MIIFpzCCA4+gAwIBAgIUZ7g3pTctpQ08sK0ia6QAbc/XXTAwDQYJKoZIhvcNAQEL
BQAwYzELMAkGA1UEBhMCVVMxDjAMBgNVBAgMBVN0YXRlMQ0wCwYDVQQHDARDaXR5
MRUwEwYDVQQKDAxTdHVkeUNvbXBhc3MxHjAcBgNVBAMMFXJwaS5zdHVkeS1jb21w
YXNzLmNvbTAeFw0yNTA3MTEwMDQ3NTNaFw0zNTA3MDkwMDQ3NTNaMGMxCzAJBgNV
BAYTAlVTMQ4wDAYDVQQIDAVTdGF0ZTENMAsGA1UEBwwEQ2l0eTEVMBMGA1UECgwM
U3R1ZHlDb21wYXNzMR4wHAYDVQQDDBVycGkuc3R1ZHktY29tcGFzcy5jb20wggIi
MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDCDksmPKijKj5SgxFh2wn2vece
bq5sCbnfgVrlUqyjTjWl1Y2cE1t7f21AZwT798gnhbjMqjSpKUPrJlBbsq0BJutc
7mbsUOv7pVfopuegKAOPrnaRBH+xD8Vxn30Lzy+p3iIsTxdwrNzh8K1faga2Yxug
Si7+zqKW2N/WAosTm5npHvLWXdMrUy/XRFiWKPAyjRem2iYEg4OpMy4qgr1vdvIW
o8Qu7c5UTjrH6G490JmP/H6SbJHMD8hj6ntjRJpSmQM0NsSGWGhqP9wBYODsixoC
0QeV6r1WiWiWpbTn6sOFJkecrh6aTXIBx9gN0+coDnS18gf/m2q6IAlpuyBrbxL1
urau9n4/8E3KXeADk2WfhWV33vGvNJ8s1GaqUJ1SCPteDszEmz5ljyapG9Dmluq0
Z44g3R+3e3x613oEcAvC4+9+NRz30rw58EK/jW78LeVgJI23c7JwPs5uAwjYdPdH
uz93DZifZ+UdFmPHf1uM/ktfgyt9Uo0lsad4JsSCUGGap2/bj1geQ3BL/L7oIvDt
2XUyrt7RUoY6aWRGKfalI/k/VDW9b0lwzaM3KBLck0HaUQGO3Mi7BKE0eVbXbL8f
4w74XuIOxBl/rQKKJsQ3lPwilQCiNOzbpCpa1b2yARhEPn2YTTXyjsEVnQHUldO9
rzZIm8dsP263YbiJ8QIDAQABo1MwUTAdBgNVHQ4EFgQUIyhlLS5EcxQ1UzSc6vX7
eAunRH8wHwYDVR0jBBgwFoAUIyhlLS5EcxQ1UzSc6vX7eAunRH8wDwYDVR0TAQH/
BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAgEAIYAmyKcnuKjMOdBbfHYDqnJTooYX
wYrsdNekWizRohsfso0rtzQf4ZsjwujjHgesj3nvIlhDQyPC/1sC5hrqyXOYcKmC
3rLWFc4JxyGsOerRXQ93x9vNA0XV39b05OZHCUKsbmX9FIqR3uYvdJHmVPCnz+0V
d3ZmtZilcTLLCyA6SsemX41z9aUjM0+0G1e/1g1W5Q4YYZ4R50+5rQe91hKR7FE2
5BGkyGZCOpKti4T0uLWoyBZAUf07YxuvVAQEZJDNmW0O5FNFNAgBxpm50770elF1
GuLy3rp+rFNEnh6XzizGDTaQhVA3KXd54vMclnsHGhQP+Svr4EEl7N+emFJ3/BQ2
T73bnGVjaANxQtUDX0rXSAc51SFZUDsCUtO1R5xjKjwQf6d1KfXCtxdCaUmi4NIS
fZlD82DwQBAQgCBORvMWHecEDH3jD9HYSx4RogSm67L3utK9m2mlSV9jfktT0kYw
aNj5ZiJd8GBhgYHbs6Eq9k6VVVuo+gXmZmskOhUs452pJ8qw9lqtrb6w7j34oQnP
+ARodA3MNy7vXzKnx5GZaphqOs0/EEUrXTNXn8hvipiVKG+btqAFrL0vCceKTE01
Ny/EPYmK/tFQselxRe6C+5swC7yovU3QqpuBKxSaUMYspSYc83XNink0nozHxmHW
rvUufN3P5kuqE1g=
-----END CERTIFICATE-----
```

**Signing Certificate Details:**
- **Subject**: C=US, ST=State, L=City, O=StudyCompass, CN=rpi.study-compass.com/signing
- **Valid From**: July 11, 2025 00:47:53 GMT
- **Valid Until**: July 9, 2035 00:47:53 GMT
- **Key Size**: 4096 bits
- **Signature Algorithm**: SHA256 with RSA

**Encryption Certificate (PEM format):**
```
-----BEGIN CERTIFICATE-----
MIIFpzCCA4+gAwIBAgIUZ7g3pTctpQ08sK0ia6QAbc/XXTAwDQYJKoZIhvcNAQEL
BQAwYzELMAkGA1UEBhMCVVMxDjAMBgNVBAgMBVN0YXRlMQ0wCwYDVQQHDARDaXR5
MRUwEwYDVQQKDAxTdHVkeUNvbXBhc3MxHjAcBgNVBAMMFXJwaS5zdHVkeS1jb21w
YXNzLmNvbTAeFw0yNTA3MTEwMDQ3NTNaFw0zNTA3MDkwMDQ3NTNaMGMxCzAJBgNV
BAYTAlVTMQ4wDAYDVQQIDAVTdGF0ZTENMAsGA1UEBwwEQ2l0eTEVMBMGA1UECgwM
U3R1ZHlDb21wYXNzMR4wHAYDVQQDDBVycGkuc3R1ZHktY29tcGFzcy5jb20wggIi
MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDCDksmPKijKj5SgxFh2wn2vece
bq5sCbnfgVrlUqyjTjWl1Y2cE1t7f21AZwT798gnhbjMqjSpKUPrJlBbsq0BJutc
7mbsUOv7pVfopuegKAOPrnaRBH+xD8Vxn30Lzy+p3iIsTxdwrNzh8K1faga2Yxug
Si7+zqKW2N/WAosTm5npHvLWXdMrUy/XRFiWKPAyjRem2iYEg4OpMy4qgr1vdvIW
o8Qu7c5UTjrH6G490JmP/H6SbJHMD8hj6ntjRJpSmQM0NsSGWGhqP9wBYODsixoC
0QeV6r1WiWiWpbTn6sOFJkecrh6aTXIBx9gN0+coDnS18gf/m2q6IAlpuyBrbxL1
urau9n4/8E3KXeADk2WfhWV33vGvNJ8s1GaqUJ1SCPteDszEmz5ljyapG9Dmluq0
Z44g3R+3e3x613oEcAvC4+9+NRz30rw58EK/jW78LeVgJI23c7JwPs5uAwjYdPdH
uz93DZifZ+UdFmPHf1uM/ktfgyt9Uo0lsad4JsSCUGGap2/bj1geQ3BL/L7oIvDt
2XUyrt7RUoY6aWRGKfalI/k/VDW9b0lwzaM3KBLck0HaUQGO3Mi7BKE0eVbXbL8f
4w74XuIOxBl/rQKKJsQ3lPwilQCiNOzbpCpa1b2yARhEPn2YTTXyjsEVnQHUldO9
rzZIm8dsP263YbiJ8QIDAQABo1MwUTAdBgNVHQ4EFgQUIyhlLS5EcxQ1UzSc6vX7
eAunRH8wHwYDVR0jBBgwFoAUIyhlLS5EcxQ1UzSc6vX7eAunRH8wDwYDVR0TAQH/
BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAgEAIYAmyKcnuKjMOdBbfHYDqnJTooYX
wYrsdNekWizRohsfso0rtzQf4ZsjwujjHgesj3nvIlhDQyPC/1sC5hrqyXOYcKmC
3rLWFc4JxyGsOerRXQ93x9vNA0XV39b05OZHCUKsbmX9FIqR3uYvdJHmVPCnz+0V
d3ZmtZilcTLLCyA6SsemX41z9aUjM0+0G1e/1g1W5Q4YYZ4R50+5rQe91hKR7FE2
5BGkyGZCOpKti4T0uLWoyBZAUf07YxuvVAQEZJDNmW0O5FNFNAgBxpm50770elF1
GuLy3rp+rFNEnh6XzizGDTaQhVA3KXd54vMclnsHGhQP+Svr4EEl7N+emFJ3/BQ2
T73bnGVjaANxQtUDX0rXSAc51SFZUDsCUtO1R5xjKjwQf6d1KfXCtxdCaUmi4NIS
fZlD82DwQBAQgCBORvMWHecEDH3jD9HYSx4RogSm67L3utK9m2mlSV9jfktT0kYw
aNj5ZiJd8GBhgYHbs6Eq9k6VVVuo+gXmZmskOhUs452pJ8qw9lqtrb6w7j34oQnP
+ARodA3MNy7vXzKnx5GZaphqOs0/EEUrXTNXn8hvipiVKG+btqAFrL0vCceKTE01
Ny/EPYmK/tFQselxRe6C+5swC7yovU3QqpuBKxSaUMYspSYc83XNink0nozHxmHW
rvUufN3P5kuqE1g=
-----END CERTIFICATE-----
```

**Encryption Certificate Details:**
- **Subject**: C=US, ST=State, L=City, O=StudyCompass, CN=rpi.study-compass.com/encryption
- **Valid From**: July 11, 2025 00:47:53 GMT
- **Valid Until**: July 9, 2035 00:47:53 GMT
- **Key Size**: 4096 bits
- **Signature Algorithm**: SHA256 with RSA

**Note**: Study Compass uses separate certificates for signing and encryption as a security best practice. The signing certificate is used for signing SAML requests and responses, while the encryption certificate is used for decrypting encrypted assertions from the IdP.

## SAML Configuration Requirements

### Required SAML Attributes

Study Compass expects the following SAML attributes to be included in the assertion:

| Attribute Name | Required | Description | Example |
|----------------|----------|-------------|---------|
| `email` | Yes | User's email address | `user@rpi.edu` |
| `firstName` | No | User's first name | `John` |
| `lastName` | No | User's last name | `Doe` |
| `displayName` | No | User's display name | `John Doe` |
| `studentId` | No | Student ID number | `123456789` |
| `department` | No | User's department | `Computer Science` |
| `role` | No | User's role | `student` |

### NameID Format
```
urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
```

### Authentication Context
```
urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
```

## SAML Settings

### Request Settings
- **AuthnRequestsSigned**: `false` (We don't sign our requests)
- **WantAssertionsSigned**: `true` (We require signed assertions)
- **WantMessageSigned**: `false` (We don't require signed messages)
- **WantNameId**: `true` (We require NameID)
- **WantNameIdEncrypted**: `false` (We don't require encrypted NameID)
- **WantAssertionsEncrypted**: `false` (We don't require encrypted assertions)

### Signature Settings
- **Signature Algorithm**: `sha256`
- **Digest Algorithm**: `sha256`

## Metadata URL

You can also access our metadata directly at:
```
https://rpi.study-compass.com/auth/saml/metadata
```

This URL provides the complete SAML metadata in XML format that can be imported directly into most IdP systems.

## Testing

### Test Login URL
```
https://rpi.study-compass.com/auth/saml/login
```

### Test Configuration
After configuration, you can test the SAML setup by:
1. Visiting the test login URL
2. Being redirected to your IdP
3. Successfully authenticating and being redirected back to Study Compass

## Troubleshooting

### Common Issues

1. **Certificate Mismatch**
   - Ensure the certificate provided above is correctly configured in your IdP
   - Verify the certificate is in PEM format
   - Check that the certificate is not expired

2. **URL Mismatches**
   - Verify all URLs are exactly as specified (case-sensitive)
   - Ensure HTTPS is used for all URLs
   - Check for trailing slashes

3. **Attribute Mapping**
   - Ensure all required attributes are being sent
   - Verify attribute names match exactly (case-sensitive)
   - Check that email addresses are in the correct format

### Error Messages

- **"SAML response is required"**: The IdP is not sending a proper SAML response
- **"Invalid SAML response"**: The response format is incorrect or missing required elements
- **"SAML authentication failed"**: The response could not be validated

## Support

If you encounter any issues during configuration:

1. Check the troubleshooting section above
2. Verify all URLs and certificates are correctly configured
3. Test with the provided test URLs
4. Contact the Study Compass development team with specific error messages

## Security Notes

- All SAML communications should use HTTPS
- The certificate provided is valid for 10 years (until July 2035)
- Keep the certificate secure and do not share private keys
- Monitor authentication logs for any suspicious activity

---

**Last Updated**: July 10, 2025  
**Certificate Expires**: July 9, 2035  
**Contact**: Study Compass Development Team 