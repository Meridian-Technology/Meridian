import React from "react";
import { Html, Section, Row, Text, Img, Container } from "@react-email/components";

const EmailVerification = ({ name, code }) => {
    const textStyles = {
        fontSize: 16,
        lineHeight: "24px",
        color: "#414141",
        textAlign: "left",
    };
    return (
        <Html style={{ margin: 0, width: "100%" }}>
            <Section
                style={{
                    margin: 0,
                    padding: "30px 0px",
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#F0F2F3",
                }}
                className="email-container"
            >
                <Section
                    style={{
                        textAlign: "center",
                        margin: "auto",
                        maxWidth: "600px",
                        backgroundColor: "#FFFFFF",
                        borderRadius: 10,
                        overflow: "hidden",
                    }}
                    className="email-content"
                >
                    <Row>
                        <Img
                            src="https://studycompass.s3.us-east-1.amazonaws.com/email/Header.png"
                            style={{
                                width: "100%",
                                objectFit: "cover",
                            }}
                        />
                    </Row>
                    <Section style={{ padding: "0 20px 20px 20px" }}>
                        <Row>
                            <Text
                                style={{
                                    margin: "0px",
                                    fontSize: 20,
                                    lineHeight: "28px",
                                    fontWeight: 600,
                                    color: "#414141",
                                }}
                            >
                                Verify Your Email
                            </Text>
                            <Container style={{ padding: "0 10%", boxSizing: "border-box" }}>
                                <Text style={textStyles}>Hi, {name}!</Text>
                                <Text style={textStyles}>
                                Thanks for signing up! To complete your registration and verify your email address, please enter the 6-digit code below:
                                </Text>
                                <Text
                                    style={{
                                        ...textStyles,
                                        fontSize: 24,
                                        fontWeight: 600,
                                        textAlign: "center",
                                        padding: "15px",
                                        margin: "15px 0",
                                        backgroundColor: "#f5f5f5",
                                        borderRadius: "5px",
                                        letterSpacing: "2px",
                                    }}
                                >
                                    {code}
                                </Text>
                                <Text style={textStyles}>
                                    For security reasons, this code will expire in 30 minutes. If you didn't request this code, you can safely ignore this email.
                                </Text>
                                <Text style={textStyles}>Happy Studying!</Text>
                                <Text style={textStyles}>
                                    - Study Compass Team
                                </Text>
                            </Container>
                        </Row>
                    </Section>
                </Section>
            </Section>
        </Html>
    );
};

export default EmailVerification;
