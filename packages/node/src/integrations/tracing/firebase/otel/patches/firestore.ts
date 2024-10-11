import type { FirebaseApp, FirebaseOptions } from '@firebase/app';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  PartialWithFieldValue,
  QuerySnapshot,
  SetOptions,
  WithFieldValue,
  addDoc,
  deleteDoc,
  getDocs,
  setDoc,
} from '@firebase/firestore';
import type { Span, Tracer } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { unwrap as shimmerUnwrap, wrap as shimmerWrap } from 'shimmer';
import type {
  AddDocType,
  DeleteDocType,
  FirebaseInstrumentationConfig,
  FirestoreSpanCreationHook,
  GetDocsType,
  SetDocType,
} from '../types';

import { SpanKind, context, trace } from '@opentelemetry/api';
import {
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type { FirebaseInstrumentation } from '../firebaseInstrumentation';

/**
 *
 * @param tracer - Opentelemetry Tracer
 * @param firestoreSupportedVersions - supported version of firebase/firestore
 * @param wrap - reference to native instrumentation wrap function
 * @param unwrap - reference to native instrumentation wrap function
 */
export function patchFirestore(
  tracer: Tracer,
  firestoreSupportedVersions: string[],
  wrap: typeof shimmerWrap,
  unwrap: typeof shimmerUnwrap,
  config: FirebaseInstrumentationConfig,
): InstrumentationNodeModuleDefinition {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const defaultFirestoreSpanCreationHook: FirestoreSpanCreationHook = () => {};

  let firestoreSpanCreationHook: FirestoreSpanCreationHook = defaultFirestoreSpanCreationHook;
  const configFirestoreSpanCreationHook = config.firestoreSpanCreationHook;

  if (typeof configFirestoreSpanCreationHook === 'function') {
    firestoreSpanCreationHook = (span: Span) => {
      safeExecuteInTheMiddle(
        () => configFirestoreSpanCreationHook(span),
        error => {
          if (!error) {
            return;
          }
          diag.error(error?.message);
        },
        true,
      );
    };
  }

  const moduleFirestoreCJS = new InstrumentationNodeModuleDefinition(
    '@firebase/firestore',
    firestoreSupportedVersions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (moduleExports: any) => wrapMethods(moduleExports, wrap, unwrap, tracer, firestoreSpanCreationHook),
  );
  const files: string[] = [
    '@firebase/firestore/dist/lite/index.node.cjs.js',
    '@firebase/firestore/dist/lite/index.node.mjs.js',
    '@firebase/firestore/dist/lite/index.rn.esm2017.js',
    '@firebase/firestore/dist/lite/index.cjs.js',
  ];

  for (let i = 0, j = files.length; i < j; i++) {
    moduleFirestoreCJS.files.push(
      new InstrumentationNodeModuleFile(
        files[i] as string,
        firestoreSupportedVersions,
        moduleExports => wrapMethods(moduleExports, wrap, unwrap, tracer, firestoreSpanCreationHook),
        moduleExports => unwrapMethods(moduleExports, unwrap),
      ),
    );
  }

  return moduleFirestoreCJS;
}

function wrapMethods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleExports: any,
  wrap: typeof shimmerWrap,
  unwrap: typeof shimmerUnwrap,
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): any {
  unwrapMethods(moduleExports, unwrap);

  wrap(moduleExports, 'addDoc', patchAddDoc(tracer, firestoreSpanCreationHook));
  wrap(moduleExports, 'getDocs', patchGetDocs(tracer, firestoreSpanCreationHook));
  wrap(moduleExports, 'setDoc', patchSetDoc(tracer, firestoreSpanCreationHook));
  wrap(moduleExports, 'deleteDoc', patchDeleteDoc(tracer, firestoreSpanCreationHook));

  return moduleExports;
}

function unwrapMethods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleExports: any,
  unwrap: typeof shimmerUnwrap,
): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (isWrapped(moduleExports.addDoc)) {
    unwrap(moduleExports, 'addDoc');
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (isWrapped(moduleExports.getDocs)) {
    unwrap(moduleExports, 'getDocs');
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (isWrapped(moduleExports.setDoc)) {
    unwrap(moduleExports, 'setDoc');
  }

  return moduleExports;
}

function patchAddDoc<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
  original: typeof addDoc,
) => (
  this: FirebaseInstrumentation,
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
) => Promise<DocumentReference<AppModelType, DbModelType>> {
  return function addDoc(original: AddDocType<AppModelType, DbModelType>) {
    return function patchAddDoc(
      reference: CollectionReference<AppModelType, DbModelType>,
      data: WithFieldValue<AppModelType>,
    ): Promise<DocumentReference<AppModelType, DbModelType>> {
      const span = startSpan(tracer, 'addDoc', reference);
      firestoreSpanCreationHook(span);
      return executeContextWithSpan<Promise<DocumentReference<AppModelType, DbModelType>>>(span, () => {
        return original(reference, data);
      });
    };
  };
}

function patchDeleteDoc<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
  original: typeof deleteDoc,
) => (this: FirebaseInstrumentation, reference: DocumentReference<AppModelType, DbModelType>) => Promise<void> {
  return function deleteDoc(original: DeleteDocType<AppModelType, DbModelType>) {
    return function patchDeleteDoc(reference: DocumentReference<AppModelType, DbModelType>): Promise<void> {
      const span = startSpan(tracer, 'deleteDoc', reference.parent || reference);
      firestoreSpanCreationHook(span);
      return executeContextWithSpan<Promise<void>>(span, () => {
        return original(reference);
      });
    };
  };
}

function patchGetDocs<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
  original: typeof getDocs,
) => (
  this: FirebaseInstrumentation,
  reference: CollectionReference<AppModelType, DbModelType>,
) => Promise<QuerySnapshot<AppModelType, DbModelType>> {
  return function getDocs(original: GetDocsType<AppModelType, DbModelType>) {
    return function patchGetDocs(
      reference: CollectionReference<AppModelType, DbModelType>,
    ): Promise<QuerySnapshot<AppModelType, DbModelType>> {
      const span = startSpan(tracer, 'getDocs', reference);
      firestoreSpanCreationHook(span);
      return executeContextWithSpan<Promise<QuerySnapshot<AppModelType, DbModelType>>>(span, () => {
        return original(reference);
      });
    };
  };
}

function patchSetDoc<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
  original: typeof setDoc,
) => (
  this: FirebaseInstrumentation,
  reference: DocumentReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType> & PartialWithFieldValue<AppModelType>,
  options?: SetOptions,
) => Promise<void> {
  return function setDoc(original: SetDocType<AppModelType, DbModelType>) {
    return function patchSetDoc(
      reference: DocumentReference<AppModelType, DbModelType>,
      data: WithFieldValue<AppModelType> & PartialWithFieldValue<AppModelType>,
      options?: SetOptions,
    ): Promise<void> {
      const span = startSpan(tracer, 'setDocs', reference.parent || reference);
      firestoreSpanCreationHook(span);

      return executeContextWithSpan<Promise<void>>(span, () => {
        return typeof options !== 'undefined' ? original(reference, data, options) : original(reference, data);
      });
    };
  };
}

function executeContextWithSpan<T>(span: Span, callback: () => T): T {
  return context.with(trace.setSpan(context.active(), span), () => {
    return safeExecuteInTheMiddle(
      (): T => {
        return callback();
      },
      err => {
        if (err) {
          span.recordException(err);
        }
        span.end();
      },
      true,
    );
  });
}

function startSpan<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  spanName: string,
  reference: CollectionReference<AppModelType, DbModelType> | DocumentReference<AppModelType, DbModelType>,
): Span {
  const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
  addAttributes(span, reference);
  return span;
}

function addAttributes<AppModelType, DbModelType extends DocumentData>(
  span: Span,
  reference: CollectionReference<AppModelType, DbModelType> | DocumentReference<AppModelType, DbModelType>,
): void {
  const firestoreApp: FirebaseApp = reference.firestore.app;
  const firestoreOptions: FirebaseOptions = firestoreApp.options;

  span.setAttributes({
    'firebase.firestore.table': reference.path,
    'firebase.firestore.type': reference.type,
    'firebase.firestore.app.name': firestoreApp.name,
    'firebase.firestore.options.projectId': firestoreOptions.projectId,
    'firebase.firestore.options.appId': firestoreOptions.appId,
    'firebase.firestore.options.messagingSenderId': firestoreOptions.messagingSenderId,
    'firebase.firestore.options.storageBucket': firestoreOptions.storageBucket,
  });
}
