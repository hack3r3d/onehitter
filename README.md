# simple-token-auth

Simple Token Auth is just that, a simple auth system that used a one-time password to authenticate a user. This isn't really even an auth system, it's just a rudimentary verification system. 

Here's how it works, and I'm sure people have experienced something similar. 

1. User wants to access application.
2. Application gets user's email address from user
3. Application generates a one-time password and sends it to the email the user provided
4. User checks their email, gets the one-time password and enters in the application
5. The applications checks that the one-time password is valid for this email address, invalidates one-time pw because it can only be used once
6. If valid, great
7. If not, access denied

This isn't very secure. Anyone with access to the email address, included admins, can view the one-time password and login with it. Email isn't very secure, while most email communications these days are encrypted, you can't count on that. 

So don't use this for any application that's doing anything with critical user data.
