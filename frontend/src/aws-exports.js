const awsconfig = { //Amplify uses this config to know which Cognito user pool to authenticate against.
  Auth: {
    Cognito: {
      region: "us-east-1",
      userPoolId: "us-east-1_SKU21cblY",      
      userPoolClientId: "637lb1aomvdsuju52s8brf9tet",  

      loginWith: {
          // You can keep it simple like this:
          email: true,
        },
      },
    },
};

export default awsconfig;
