import { scopedDatabase } from '../accounts/localScope';
import { openBrowserTimelapse } from './storage';
export const openTimelapseStore = () => openBrowserTimelapse(scopedDatabase('piiin-timelapse'));
export const openTimelapseTestStore = () => openBrowserTimelapse('piiin-timelapse-qa');
export const canResizeTimelapsePreview = false;
export const resizeTimelapsePreview = async (_width: number, _height: number) => {};
