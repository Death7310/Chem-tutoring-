import { db, type Problem, type ProblemSet, type StudySession } from "./db";
import { blobToBase64 } from "./images";

/** Study data (sessions, problem sets, review progress, images) as one file, so it can be moved
 *  between devices, e.g. photograph a test on the phone and study it on the iPad.
 *  Books are not included: import the book file on each device. */
interface Backup {
  app: "chem-tutor";
  version: 1;
  exportedAt: number;
  sessions: StudySession[];
  problemSets: ProblemSet[];
  problems: Problem[];
  images: Array<{ id: string; type: string; data: string }>;
}

export async function exportStudyData(): Promise<Blob> {
  const [sessions, problemSets, problems] = await Promise.all([
    db.sessions.toArray(),
    db.problemSets.toArray(),
    db.problems.toArray(),
  ]);
  const imageIds = new Set([...sessions.flatMap((s) => s.messages.flatMap((m) => m.imageIds)), ...problemSets.flatMap((s) => s.imageIds)]);
  const images: Backup["images"] = [];
  for (const id of imageIds) {
    const file = await db.files.get(id);
    if (file) images.push({ id, type: file.blob.type, data: await blobToBase64(file.blob) });
  }
  const backup: Backup = { app: "chem-tutor", version: 1, exportedAt: Date.now(), sessions, problemSets, problems, images };
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

/** Merges a backup into this device. Items with the same id are replaced by the backup's copy. */
export async function importStudyData(file: File): Promise<{ sets: number; sessions: number }> {
  const backup = JSON.parse(await file.text()) as Backup;
  if (backup.app !== "chem-tutor" || backup.version !== 1) throw new Error("This isn't a Chem Tutor backup file.");
  await db.transaction("rw", [db.sessions, db.problemSets, db.problems, db.files], async () => {
    for (const image of backup.images) {
      const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
      await db.files.put({ id: image.id, blob: new Blob([bytes], { type: image.type }) });
    }
    await db.sessions.bulkPut(backup.sessions);
    await db.problemSets.bulkPut(backup.problemSets);
    await db.problems.bulkPut(backup.problems);
  });
  return { sets: backup.problemSets.length, sessions: backup.sessions.length };
}
