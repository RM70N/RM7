import fs from 'node:fs/promises';
import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { transcribeAudio } from './transcriptionService.js';
import { extractAudioFromVideo } from './extraction/audioExtraction.js';
import { extractTextFromPdf } from './extraction/pdfExtraction.js';
import { extractTextFromImage } from './visionService.js';
import { analyzeLecture } from './aiAnalysisService.js';
import { mergeProfessorFingerprint, getKnownEmphasisPhrases } from './professorFingerprintService.js';
import { logger } from '../utils/logger.js';

const lectureRef = (lectureId) => firestore.collection('lectures').doc(lectureId);

async function updateStatus(lectureId, processingStatus, extra = {}) {
  await lectureRef(lectureId).set(
    { processingStatus, updatedAt: FieldValue.serverTimestamp(), ...extra },
    { merge: true }
  );
}

/**
 * خط أنابيب المعالجة الكامل: يعمل بشكل غير متزامن بعد ما يرجع السيرفر رد فوري للطالب.
 * لا يحفظ أي ملف بشكل دائم — كل الملفات المؤقتة تُحذف بنهاية المعالجة (نجحت أو فشلت).
 *
 * @param {object} params
 * @param {string} params.lectureId
 * @param {string} params.courseId
 * @param {string} params.courseName
 * @param {string} params.sourceType - audio | video | pdf | image
 * @param {string} params.filePath - مسار الملف المؤقت على القرص
 * @param {string} params.mimetype
 */
export async function runLecturePipeline({ lectureId, courseId, courseName, sourceType, filePath, mimetype }) {
  const tempFiles = [filePath];

  try {
    let sourceText;

    if (sourceType === 'audio') {
      await updateStatus(lectureId, 'transcribing');
      const { text } = await transcribeAudio(filePath, mimetype);
      sourceText = text;
    } else if (sourceType === 'video') {
      await updateStatus(lectureId, 'transcribing');
      const audioPath = await extractAudioFromVideo(filePath);
      tempFiles.push(audioPath);
      const { text } = await transcribeAudio(audioPath, 'audio/mpeg');
      sourceText = text;
    } else if (sourceType === 'pdf') {
      await updateStatus(lectureId, 'transcribing');
      sourceText = await extractTextFromPdf(filePath);
    } else if (sourceType === 'image') {
      await updateStatus(lectureId, 'transcribing');
      sourceText = await extractTextFromImage(filePath, mimetype);
    } else {
      throw new Error(`نوع محتوى غير معروف: ${sourceType}`);
    }

    await updateStatus(lectureId, 'analyzing', { transcriptText: sourceText });

    const knownEmphasisPhrases = await getKnownEmphasisPhrases(courseId);
    const analysis = await analyzeLecture({ sourceText, courseName, knownEmphasisPhrases });

    const confidenceMap = analysis.summary.map((s) => ({ text: s.text, source: s.source }));
    const detectedGaps = (analysis.gaps || []).map((g) => ({
      afterSummaryIndex: g.afterSummaryIndex,
      note: g.note,
    }));

    await updateStatus(lectureId, 'done', {
      summaryText: analysis.summary.map((s) => s.text).join(' '),
      confidenceMap,
      detectedGaps,
      mindMapJson: analysis.mindMap,
      flashcards: analysis.flashcards || [],
      quizQuestions: analysis.quiz || [],
      errorMessage: FieldValue.delete(),
    });

    await mergeProfessorFingerprint(courseId, analysis.emphasisPhrases || []);
  } catch (err) {
    logger.error(`فشلت معالجة المحاضرة ${lectureId}:`, err);
    await updateStatus(lectureId, 'error', {
      errorMessage: err?.messageAr || 'صار خطأ أثناء معالجة المحاضرة. جرّب رفعها مرة ثانية.',
    });
  } finally {
    await Promise.all(
      tempFiles.map((p) =>
        fs.unlink(p).catch(() => {
          /* الملف قد يكون انحذف مسبقًا، تجاهل */
        })
      )
    );
  }
}
