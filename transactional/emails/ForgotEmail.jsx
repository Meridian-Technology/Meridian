import React from "react";
import { Html, Section, Text } from "@react-email/components";

// Design tokens - matches org invite & Meridian brand
const styles = {
    container: {
        margin: 0,
        // padding: "30px 0",
        width: "100%",
        minHeight: "100%",
        // backgroundColor: "#F6F6F6",
    },
    card: {
        margin: "0 auto",
        maxWidth: "600px",
        // backgroundColor: "#FFFFFF",
        borderRadius: 8,
        overflow: "hidden",
    },
    content: {
        padding: "24px",
        textAlign: "left",
    },
    title: {
        margin: "0 0 20px 0",
        fontSize: "1.5em",
        lineHeight: "28px",
        fontWeight: 600,
        color: "#1f2937",
    },
    body: {
        fontSize: 16,
        lineHeight: "24px",
        color: "#414141",
        margin: "0 0 16px 0",
    },
    codeBox: {
        fontSize: 24,
        fontWeight: 600,
        textAlign: "center",
        padding: "12px 24px",
        margin: "20px 0",
        backgroundColor: "#F0F4FE",
        border: "1px solid #6D8EFA",
        borderRadius: 8,
        letterSpacing: "2px",
        color: "#6D8EFA",
    },
    footer: {
        marginTop: 24,
        fontSize: 14,
        color: "#6b7280",
        lineHeight: "20px",
    },
};

const MyEmail = ({ name, code }) => {
    return (
        <Html style={{ margin: 0, width: "100%" }}>
            <Section style={styles.container} className="email-container">
                <Section style={styles.card} className="email-content">
                    <Section style={styles.content}>
                        <Text style={styles.title}>Forgot Your Password?</Text>
                        <Text style={styles.body}>Hi, {name}!</Text>
                        <Text style={styles.body}>
                            It looks like you requested a password reset for your Meridian account. No worries, we're here to help you get back on track!
                        </Text>
                        <Text style={styles.body}>
                            Please use the following verification code to reset your password:
                        </Text>
                        <Text style={styles.codeBox}>{code}</Text>
                        <Text style={styles.footer}>
                            For security reasons, this code will expire in 30 minutes. If you didn't request this password reset, you can safely ignore this email.
                        </Text>
                    </Section>
                </Section>
            </Section>
        </Html>
    );
};

export default MyEmail;
