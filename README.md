# OneHitter
OneHitter is a simple auth system that uses a one-time password to authenticate a user. This isn't really even an auth system, it's just a rudimentary verification system. This isn't really secure, so don't use it as-if it is.

Here's how it works, and I'm sure people have experienced something similar. 

1. User wants to access application
2. Application requests user's email address from the user
3. Application generates a one-time password and sends it to the email the user provided
4. User checks their email, gets the one-time password and enters the one-time password in the application
5. The applications checks that the one-time password is valid for this email address, invalidates one-time pw because it can only be used once
6. If valid, great
7. If not, access denied

This isn't secure because it relies on email. Anyone with access to the email address, including admins, can view the one-time password and login with it. Email isn't secure, while most email communications these days are encrypted, you can't count on it. 

So don't use this for any application that's doing anything with critical user data.

## Getting Started 

I consider this package to an opinionated one. It only works when using MongoDB for storage and Amazon SES for message delivery.

So to use this package, you will need to configure both MongoDB and Amazon SES. 

I'm not going to go deep in how to configure MongoDB and Amazon SES. There are plenty of tutorials to help with that stuff. The Amazon SES documentation can be found [here](https://docs.aws.amazon.com/ses/latest/dg/send-email.html). 

To make your passwords expire automatically, you have to configure a TTL on your MongoDB collection. It's basically creating an index on a field that TTL will be tied to. For onehitter, you need to create an index on createdAt. MongoDB has a tutorial for how to configure an index with a TTL [here](https://www.mongodb.com/docs/manual/tutorial/expire-data/). The only difference between what you need to do here and what's in the tutorial, is use createdAt as the field to set the TTL on and set the `{ expireAfterSeconds: 1 }` to however many seconds you want your onetime passwords to live for. I use 1800, or 30 minutes. 

Whatever you decide to set the expiry to, you should update your .env OTP_EXPIRY to be the same value. This controls the email message indicating how long the user has to use the password. Setting that .env config setting has no impact on the actual TTL, that's controlled in MongoDB via that aforementioned index.

As I eluded to in the previous paragraph, you will need to create a .env file, or use some mechanism like AWS Secrets to provide onehitter with the configuration it needs to operate. You need the below values to be available via process.env

### Configuration Settings
#### MONGO_CONNECTION
This is the connection string used to connect to mongo. 

It will look something like this.
```
mongodb+srv://myspecialusername:myspecialpassword@cluster0.xefwer0q.mongodb.net/?retryWrites=true&w=majority
```

#### MONGO_COLLECTION
The Mongo Collection is just like it sounds, the collection in MongoDB where you plan on storing your onehitter data.

#### MONGO_DATABASE
The Mongo Database is where the collection lives. In MongoDB, a database can have many collections. So you can put your onehitter collection in your application database. 

#### OTP_MESSAGE_FROM
Message From is the email address that the onetime password email to the user is sent from. This has to be an email address from a domain that Amazon SES has validated.

#### OTP_MESSAGE_SUBJECT
This is the subject of the email to the user notifying them of their new onetime password.

#### OTP_URL
This is the url included in the onetime password email notification.
```
https://example.com
```

#### OTP_EXPIRY
This is how many seconds an onetime password is supposed to live. This is only for the email notification. To actually change the expiry, you have to recreate the index in MongoDB with the new expiry value.

#### OTP_LENGTH
This is the length of the onetime password - the number of characters.

#### OTP_LETTERS_UPPER
If true, use upper case letters in onetime password.

#### OTP_LETTERS_LOWER
If true, use lower case letters in onetime password.

#### OTP_DIGITS
If true, use digits in onetime password.

#### OTP_SPECIAL_CHARS
If true, use special characters in onetime password.