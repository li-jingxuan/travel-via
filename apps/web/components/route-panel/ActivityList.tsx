import { useEffect, useMemo, useState } from "react";
import styles from "./route-panel.module.scss";
import type { ActivityListProps } from "./route-panel.types";

interface PreviewImage {
  src: string;
  alt: string;
}

export function ActivityList({ activities }: ActivityListProps) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  const hasAnyImage = useMemo(() => {
    return activities.some((activity) => activity.images.length > 0);
  }, [activities]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  return (
    <>
      <section className={styles.card}>
        <h3 className={styles.sectionTitle}>活动安排</h3>
        <ul className={styles.activityList}>
          {activities.map((activity) => (
            <li key={activity.name} className={styles.activityItem}>
              <div className={styles.activityContent}>
                <h4>{activity.name}</h4>
                <p>{activity.description}</p>
                <div className={styles.activityMeta}>
                  <span>{activity.suggestedHours}</span>
                  <span>{activity.openingHoursText}</span>
                  <span>{activity.ticketText}</span>
                </div>
              </div>

              <div className={styles.activityGallery}>
                {activity.images.length > 0 ? (
                  activity.images.map((image, imageIndex) => (
                    <button
                      key={`${activity.name}-${imageIndex}`}
                      type="button"
                      className={styles.thumbnailButton}
                      onClick={() => setPreviewImage(image)}
                      aria-label={`查看 ${activity.name} 大图 ${imageIndex + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.src} alt={image.alt} className={styles.activityImage} />
                    </button>
                  ))
                ) : (
                  <div className={styles.activityImageFallback}>无图</div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!hasAnyImage ? <p className={styles.noImageHint}>当前活动暂无可预览图片</p> : null}
      </section>

      {previewImage ? (
        <div
          className={styles.lightboxBackdrop}
          role="button"
          tabIndex={0}
          onClick={() => setPreviewImage(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              setPreviewImage(null);
            }
          }}
          aria-label="关闭图片预览"
        >
          <div
            className={styles.lightboxDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="活动图片大图预览"
          >
            <button
              type="button"
              className={styles.lightboxClose}
              onClick={() => setPreviewImage(null)}
              aria-label="关闭预览"
            >
              关闭
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImage.src} alt={previewImage.alt} className={styles.lightboxImage} />
            <p className={styles.lightboxCaption}>{previewImage.alt}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
