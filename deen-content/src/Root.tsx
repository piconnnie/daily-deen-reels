import React from 'react';
import {Composition, Still} from 'remotion';
import {Cover} from './compositions/Cover';
import {REELS} from './content';
import {ReelTemplate, sceneStarts} from './templates/ReelTemplate';

// One Reel composition and one Cover still per content file.
export const RemotionRoot: React.FC = () => (
  <>
    {REELS.map((config) => (
      <React.Fragment key={config.id}>
        <Composition
          id={`Reel-${config.id}`}
          component={ReelTemplate}
          durationInFrames={sceneStarts(config.scenes).total}
          fps={config.fps}
          width={config.width}
          height={config.height}
          defaultProps={{config}}
        />
        <Still id={`Cover-${config.id}`} component={Cover} width={config.width} height={config.height} defaultProps={{config}} />
      </React.Fragment>
    ))}
  </>
);
