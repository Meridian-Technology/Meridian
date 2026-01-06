import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

const variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export default function AnimatedPageWrapper({ children, watchFullPath = false }) {
  const location = useLocation();
  const animationKey = watchFullPath
    ? location.key + location.pathname + location.search + location.hash
    : location.pathname.includes('room') ? location.pathname.split('/')[1] : location.pathname;


  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={animationKey}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ position: 'absolute', width: '100%', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
