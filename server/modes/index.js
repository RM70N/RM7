import normal from './normal.js';
import speed from './speed.js';
import secret from './secret.js';
import collab from './collab.js';
import missingPiece from './missingPiece.js';
import masterpiece from './masterpiece.js';
import story from './story.js';
import points from './points.js';

export const MODES = {
  normal, speed, secret, collab,
  missing_piece: missingPiece,
  masterpiece, story, points,
};

export function getMode(id) {
  return MODES[id] || MODES.normal;
}

export function listModes() {
  return Object.values(MODES).map((m) => ({ id: m.id, name: m.name, description: m.description }));
}
