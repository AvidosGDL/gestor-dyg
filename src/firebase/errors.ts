import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '.';

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;
  public user: any;

  constructor(context: SecurityRuleContext) {
    const firebase = initializeFirebase();
    const auth = getAuth(firebase.app);
    const user = auth.currentUser
      ? {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          displayName: auth.currentUser.displayName,
          token: auth.currentUser.getIdToken,
        }
      : null;

    const message = `Firestore Permission Denied: The following request was denied by Firestore Security Rules:
{
  "auth": ${JSON.stringify(user, null, 2)},
  "operation": "${context.operation}",
  "path": "${context.path}"
  ${
    context.requestResourceData
      ? `,"resource": ${JSON.stringify(context.requestResourceData, null, 2)}`
      : ''
  }
}`;

    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    this.user = user;
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
