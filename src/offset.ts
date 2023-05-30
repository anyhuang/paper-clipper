/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as clipperLib from 'js-angusj-clipper';
import paper from 'paper';
import paperClipperSimplify, { paperClipperSimplifyTolerance } from './paperClipperSimplify';

// @ts-ignore
paper.setup();

enum EndTypes {
  round = clipperLib.EndType.OpenRound,
  square = clipperLib.EndType.OpenSquare,
  butt = clipperLib.EndType.OpenButt,
  closed = clipperLib.EndType.ClosedPolygon, // clipperLib.EndType.ClosedLine
}

enum JoinTypes {
  miter = clipperLib.JoinType.Miter,
  round = clipperLib.JoinType.Round,
  bevel = clipperLib.JoinType.Square,
}

const scale = 1000;
const simplifyJsTolerance = 0.5;

type ClipperOffsetOptions = {
  offset: number;
  tolerance?: number;
  simplify?: ((targetPath: paper.Path) => paper.Path) | Boolean;
};

type ClipperOffsetCallback = {
  (path: paper.Path, options: ClipperOffsetOptions, tolerance?: number): Promise<paper.Path[]>;
  (path: paper.Path, offset: number, tolerance?: number): Promise<paper.Path[]>;
};

function clipperOffset(clipper: clipperLib.ClipperLibWrapper): ClipperOffsetCallback;
function clipperOffset(clipper: clipperLib.ClipperLibWrapper) {
  return async (
    path: paper.Path,
    options: any,
    tolerance: number = paperClipperSimplifyTolerance,
  ): Promise<paper.Path[]> => {
    const suppliedOffset = !isNaN(options);
    const suppliedOptions = typeof options === 'object' && !isNaN(options.offset);

    if (!suppliedOffset && !suppliedOptions) {
      throw new Error(`clipperOffset callback expects an options object or offset number as second argument.
      ex: await clipperOffset(clipper)(path, 10)
      or  await clipperOffset(clipper)(path, { offset: 10, simplify: false })`);
    }

    const offsetOptions: ClipperOffsetOptions = suppliedOptions
      ? options
      : {
          offset: options,
        };
    const { closed, strokeJoin, strokeCap, miterLimit } = path;
    const pathCopy = path.clone() as paper.Path;
    pathCopy.flatten(1e-2);

    let data = pathCopy.segments.map(({ point }) => ({
      x: Math.round(point.x * scale),
      y: Math.round(point.y * scale),
    }));

    data = clipper.cleanPolygon(data, 1e-2 * scale);

    let offsetPaths = clipper.offsetToPaths({
      delta: offsetOptions.offset * scale,
      miterLimit: miterLimit * scale,
      arcTolerance: 1e-2 * scale,
      offsetInputs: [
        {
          // @ts-ignore
          joinType: JoinTypes[strokeJoin],
          // @ts-ignore
          endType: closed ? EndTypes.closed : EndTypes[strokeCap],
          data,
        },
      ],
    });
    if (offsetPaths) {
      offsetPaths = clipper.cleanPolygons(offsetPaths, 1e-2 * scale);
      // let polyTree = clipper.clipToPolyTree({
      //   clipType: clipperLib.ClipType.Union,
      //   reverseSolution: true,
      //   subjectInputs: offsetPaths.map((path) => ({
      //     data: path,
      //     closed: true,
      //   })),
      //   subjectFillType: clipperLib.PolyFillType.EvenOdd,
      // });

      // if (polyTree) {
      //   polyTree.childs.map((child) => {
      //     if (!child.isHole) {
      //       return child;
      //     }
      //   });
      //   offsetPaths = clipper.polyTreeToPaths(polyTree);
      // }
    }

    if (!offsetPaths) return [];

    const isfunction = (fn: any): fn is Function => typeof fn === 'function';
    const isUndefinedOrTrue = (opt: any) => typeof opt === 'undefined' || opt === true;

    // If simplify option is a function, then use the function provided
    const simplifyFn = isfunction(offsetOptions.simplify)
      ? offsetOptions.simplify
      : // If simplify option is underfined or true, use built-in simplify function
      isUndefinedOrTrue(offsetOptions.simplify)
      ? paperClipperSimplify(tolerance)
      : // Otherwise perform no-op when processing path
        (path: paper.Path) => path;

    return offsetPaths
      .map((offsetPath) => {
        const p = new paper.Path();
        p.strokeCap = 'round';
        p.strokeJoin = 'round';
        p.closed = true;
        const segments = offsetPath.map((point) => ({
          x: point.x / scale,
          y: point.y / scale,
        }));
        // @ts-ignore
        p.segments = segments;

        return p;
      })
      .map(simplifyFn)
      .filter((offsetPath) => offsetPath.length && offsetPath.length > 3);
  };
}

export default clipperOffset;
