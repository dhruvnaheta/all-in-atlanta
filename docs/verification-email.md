# Verification email setup

Status: the app now tells unverified players to check their spam folder. Production
email configuration remains pending: the available Firebase CLI credential received
403 PERMISSION_DENIED from the project's Identity Toolkit configuration endpoint.
No sending-domain or template changes have been applied.

In [Firebase Authentication templates](https://console.firebase.google.com/project/all-in-atlanta-pok/authentication/emails):

1. Edit Email address verification. Set sender name to **All In Atlanta Poker League**
   and subject to **Verify your email for All In Atlanta**. Set the project's
   public-facing name to **All In Atlanta**.
2. Choose Customize domain and enter **allinatlanta.com**. Add the exact DNS records
   Firebase supplies at the domain's DNS provider. Preserve existing mail records;
   merge SPF requirements into the existing SPF record if one is present.
3. Wait for Firebase to verify the records, then choose **Apply Custom Domain**.
   Set the sender address to **noreply@allinatlanta.com**.
4. Test verification with a new test account in Gmail and Outlook, including spam
   placement, sender identity, authentication headers, and the verification link.
   A custom domain does not guarantee inbox placement.

Firebase's built-in verification body is restricted; sender, subject and app name
provide branding. A fully custom body requires generated verification links and a
separate mail delivery service. Do not point the action URL at the static homepage:
it does not implement an email action handler. Keep Firebase's working handler.

References: [Firebase domain setup](https://firebase.google.com/docs/auth/email-custom-domain)
and [editable template fields](https://support.google.com/firebase/answer/7000714).

Follow-up check: public DNS uses `lunar.dns-parking.com` and
`solar.dns-parking.com`, indicating Hostinger DNS. The Firebase Authentication
configuration API was checked again and returned HTTP 403, "The caller does not
have permission." Custom sender setup still needs Firebase Authentication
configuration access and access to this domain's Hostinger DNS zone. No DNS or
sender settings were changed. The spam-folder hint exists in this branch's account
verification screen; production main currently has only the older admin login,
so the hint ships with the account feature deployment.
