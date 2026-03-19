import React from 'react';
import type { Root } from 'react-dom/client';
import { bootstrapNative as bootstrap } from '@findthem/capacitor-native';
import i18n from '../i18n';
import NativeApp from '../NativeApp';

export async function bootstrapNative(root: Root): Promise<void> {
  await bootstrap({
    root,
    i18n,
    appElement: <NativeApp />,
  });
}
