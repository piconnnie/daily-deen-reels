import React from 'react';
import {Composition, Still} from 'remotion';
import {Cover} from './compositions/Cover';
import {REELS} from './content';
import {ReelTemplate, sceneStarts} from './templates/ReelTemplate';
import {StillTemplate, stillSize} from './templates/StillTemplate';

// Reels: one Reel composition + one Cover still. Carousels: one Still per slide
// (1080×1350). Stories: one Still (1080×1920).
export const RemotionRoot: React.FC = () => (
  <>
    {REELS.map((config) => {
      const kind = config.kind ?? 'reel';
      if (kind !== 'reel') {
        const size = stillSize(config);
        return (
          <React.Fragment key={config.id}>
            {config.scenes.map((_, i) => (
              <Still key={i} id={`Slide-${config.id}-${i + 1}`} component={StillTemplate} width={size.width} height={size.height} defaultProps={{config, index: i}} />
            ))}
          </React.Fragment>
        );
      }
      return (
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
      );
    })}
  </>
);
