import React from "react";
import { Html, Section, Text, Button, Row, Column } from "@react-email/components";

// Design tokens - matches ForgotEmail & Meridian brand
const styles = {
    container: {
        margin: 0,
        padding: "30px 0",
        width: "100%",
        minHeight: "100%",
        backgroundColor: "#F6F6F6",
    },
    card: {
        margin: "0 auto",
        maxWidth: "600px",
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        overflow: "hidden",
    },
    content: {
        padding: "24px",
        textAlign: "left",
    },
    title: {
        margin: "0 0 20px 0",
        fontSize: 20,
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
    button: {
        backgroundColor: "#6D8EFA",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: 8,
        fontWeight: 600,
    },
    buttonSecondary: {
        backgroundColor: "#6b7280",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: 8,
        fontWeight: 600,
    },
    footer: {
        marginTop: 24,
        fontSize: 14,
        color: "#6b7280",
        lineHeight: "20px",
    },
};

const OrgInviteExistingUser = ({ orgName, orgDescription, role, roleDisplayName, inviterName, acceptUrl, declineUrl }) => {
    const displayRole = roleDisplayName || role;
    const description = orgDescription || "Join this organization on Meridian to collaborate, manage events, and connect with members.";
    const truncatedDescription = description.length > 300 ? description.substring(0, 300) + "..." : description;

    return (
        <Html style={{ margin: 0, width: "100%" }}>
            <Section style={styles.container} className="email-container">
                <Section style={styles.card} className="email-content">
                    <Section style={styles.content}>
                        <Text style={styles.title}>Organization invitation</Text>
                        <Text style={styles.body}>
                            <strong>{inviterName}</strong> has invited you to join <strong>{orgName}</strong> as <strong>{displayRole}</strong>.
                        </Text>
                        <Text style={styles.body}>
                            <strong>About {orgName}</strong>
                        </Text>
                        <Text style={styles.body}>{truncatedDescription}</Text>
                        <Text style={styles.body}>
                            <strong>Your role</strong>
                        </Text>
                        <Text style={styles.body}>
                            As {displayRole}, you will have access to the organization's events, members, and resources based on your permissions.
                        </Text>
                        <Text style={styles.body}>
                            <strong>What to do next</strong>
                        </Text>
                        <Text style={styles.body}>
                            Click below to accept or decline this invitation. If you accept, you'll be added to the organization immediately.
                        </Text>
                        <Row style={{ marginTop: 24 }}>
                            <Column style={{ paddingRight: 12 }}>
                                <Button href={acceptUrl} style={styles.button}>
                                    Accept invitation
                                </Button>
                            </Column>
                            <Column>
                                <Button href={declineUrl} style={styles.buttonSecondary}>
                                    Decline
                                </Button>
                            </Column>
                        </Row>
                        <Text style={styles.footer}>
                            This invitation will expire in 7 days. This is an automated message from Meridian.
                        </Text>
                    </Section>
                </Section>
            </Section>
        </Html>
    );
};

export default OrgInviteExistingUser;
