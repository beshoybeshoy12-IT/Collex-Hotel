// Typed translation keys: using a key that does not exist in en.json is a compile error.
type Messages = typeof import('./messages/en.json');
declare interface IntlMessages extends Messages {}
