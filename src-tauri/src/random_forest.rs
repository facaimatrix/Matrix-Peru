//! RandomForest regression prediction, reading the JSON produced by
//! `convert_models.R`.
//!
//! Prediction for a regression forest = the mean, over all trees, of the
//! terminal-node fitted value reached by traversing the tree.
//!
//! Tree traversal mirrors the `randomForest` C code for *numeric* predictors:
//!   start at the root (node id 1), and at each internal node
//!     if  x[split_var] <= split_point  -> go to the LEFT daughter
//!     else                             -> go to the RIGHT daughter
//!   a node is TERMINAL when split_var == 0; return its `prediction`.
//!
//! Node ids in the JSON are 1-based (0 = none), so we subtract 1 to index.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Tree {
    pub left: Vec<i64>,         // 1-based daughter node id (0 = terminal)
    pub right: Vec<i64>,        // 1-based daughter node id (0 = terminal)
    pub split_var: Vec<i64>,    // 1-based predictor index (0 = terminal node)
    pub split_point: Vec<f64>,  // split threshold
    pub prediction: Vec<f64>,   // node fitted value
}

#[derive(Debug, Deserialize)]
pub struct RandomForest {
    pub ntree: usize,
    /// Predictor names in the exact order the `split_var` index refers to.
    pub var_names: Vec<String>,
    pub trees: Vec<Tree>,
}

impl RandomForest {
    /// Load a forest from a JSON file on disk.
    pub fn from_json_file(path: &std::path::Path) -> Result<Self, String> {
        let txt = std::fs::read_to_string(path)
            .map_err(|e| format!("Cannot read model '{}': {}", path.display(), e))?;
        let rf: RandomForest = serde_json::from_str(&txt)
            .map_err(|e| format!("Cannot parse model '{}': {}", path.display(), e))?;
        if rf.trees.is_empty() {
            return Err(format!("Model '{}' contains no trees", path.display()));
        }
        Ok(rf)
    }

    /// Predict for a single feature vector. `feats` must be aligned to
    /// `self.var_names` (same length, same order).
    pub fn predict_one(&self, feats: &[f64]) -> f64 {
        let mut acc = 0.0_f64;
        for tree in &self.trees {
            let mut node = 0usize; // node id 1 -> index 0
            loop {
                let sv = tree.split_var[node];
                if sv == 0 {
                    acc += tree.prediction[node];
                    break;
                }
                let var_idx = (sv - 1) as usize;
                let next = if feats[var_idx] <= tree.split_point[node] {
                    tree.left[node]
                } else {
                    tree.right[node]
                };
                // Defensive: a malformed tree could point past the end.
                let ni = (next - 1) as usize;
                if next <= 0 || ni >= tree.split_var.len() {
                    acc += tree.prediction[node];
                    break;
                }
                node = ni;
            }
        }
        acc / self.trees.len() as f64
    }
}
