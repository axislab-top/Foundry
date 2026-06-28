import type { CollaborationDeliverableArtifactRow } from '../collaboration/utils/employee-deliverable-artifacts.util.js';

import type { RegisteredFileAsset } from './file-assets-registration.service.js';

import { extractStoragePathFromUri } from './register-file-assets-from-artifacts.util.js';



/** 将 fileAssets.register / registerFromContent 返回的 ID 写回 artifact 行。 */

export function attachFileAssetIdsToArtifactRows(

  rows: CollaborationDeliverableArtifactRow[],

  registered: RegisteredFileAsset[],

  companyId: string,

): CollaborationDeliverableArtifactRow[] {

  if (!registered.length) return rows;

  return rows.map((row, index) => {

    if (String(row.fileAssetId ?? '').trim()) return row;



    const byIndex = registered.find((r) => r.artifactIndex === index);

    if (byIndex) return { ...row, fileAssetId: byIndex.fileAssetId };



    const uri = String(row.uri ?? '').trim();

    if (uri) {

      const path = extractStoragePathFromUri(uri, companyId);

      if (path) {

        const hit = registered.find(

          (r) =>

            r.storagePath &&

            (r.storagePath === path || path.endsWith(`/${r.storagePath}`) || r.storagePath.endsWith(path)),

        );

        if (hit) return { ...row, fileAssetId: hit.fileAssetId };

      }

    }



    if (index === 0) {

      const textHit = registered.find((r) => r.artifactIndex === 0 || r.artifactIndex === index);

      if (textHit) return { ...row, fileAssetId: textHit.fileAssetId };

    }



    return row;

  });

}


