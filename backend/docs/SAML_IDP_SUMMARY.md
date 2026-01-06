# SAML Configuration Summary for IdP Team

## Essential Information

**Entity ID:** `https://rpi.study-compass.com/auth/saml/metadata`  
**ACS URL:** `https://rpi.study-compass.com/auth/saml/callback` (HTTP-POST)  
**SLO URL:** `https://rpi.study-compass.com/auth/saml/logout` (HTTP-Redirect)  

## Certificate (10-year validity until July 2035)

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
fZlD82DwQBAQgCBORvMWHecEDH3jD9HYSx4RogSm67L3utK9m2mlSV9jfktT0kY
aNj5ZiJd8GBhgYHbs6Eq9k6VVVuo+gXmZmskOhUs452pJ8qw9lqtrb6w7j34oQnP
+ARodA3MNy7vXzKnx5GZaphqOs0/EEUrXTNXn8hvipiVKG+btqAFrL0vCceKTE01
Ny/EPYmK/tFQselxRe6C+5swC7yovU3QqpuBKxSaUMYspSYc83XNink0nozHxmHW
rvUufN3P5kuqE1g=
-----END CERTIFICATE-----
```

## Required Attributes

**Required:** `email`  
**Optional:** `firstName`, `lastName`, `displayName`, `studentId`, `department`, `role`

## SAML Settings

- **WantAssertionsSigned**: `true`
- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Signature Algorithm**: `sha256`

## Metadata URL

For automatic configuration: `https://rpi.study-compass.com/auth/saml/metadata`

## Test URL

`https://rpi.study-compass.com/auth/saml/login`

---

**Certificate Valid Until:** July 9, 2035  
**Last Updated:** July 10, 2025 